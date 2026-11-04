//go:build linux

package bootstrap

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

func InspectP0Host(directory string, budget DiskBudget) (P0HostFacts, error) {
	base, err := inspectHostFacts(directory)
	f := P0HostFacts{HostFacts: base, EffectiveMemoryBytes: base.MemoryBytes}
	if err != nil {
		return f, err
	}
	if raw, e := readP0Bounded("/sys/firmware/dmi/tables/DMI", 1<<20); e == nil {
		f.PhysicalMemoryBytes = physicalMemorySMBIOS(raw)
		if f.PhysicalMemoryBytes > 0 {
			f.MemorySource = "smbios-type17"
		}
	}
	if f.PhysicalMemoryBytes == 0 && base.MemoryBytes >= 2*GiB {
		// MemTotal is only a lower bound, never rounded up to nominal RAM.
		f.PhysicalMemoryBytes = base.MemoryBytes
		f.MemorySource = "memtotal-lower-bound"
	}
	if err = inspectP0Cgroup(&f); err != nil {
		return f, ErrPreflight
	}
	var disk syscall.Statfs_t
	if syscall.Statfs(directory, &disk) != nil || disk.Bsize <= 0 || disk.Blocks > math.MaxUint64/uint64(disk.Bsize) {
		return f, ErrPreflight
	}
	f.TotalDiskBytes = disk.Blocks * uint64(disk.Bsize)
	f.DiskSource = "filesystem-lower-bound"
	if n, e := rootBlockCapacity(directory); e == nil && n >= f.TotalDiskBytes {
		f.TotalDiskBytes = n
		f.DiskSource = "backing-block-device"
	}
	return f, ValidateP0Host(f, budget)
}

func readP0Bounded(name string, max int64) ([]byte, error) {
	file, err := os.Open(name)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	// sysfs pseudo-files commonly report size zero; bound actual reads.
	raw, err := io.ReadAll(io.LimitReader(file, max+1))
	if err != nil || int64(len(raw)) > max {
		return nil, ErrPreflight
	}
	return raw, nil
}

// SMBIOS Memory Device records express actual installed/allocated memory.
// Unknown/empty records do not contribute to the proven lower bound.
func physicalMemorySMBIOS(raw []byte) uint64 {
	var total uint64
	for len(raw) >= 4 {
		length := int(raw[1])
		if length < 4 || length > len(raw) {
			return 0
		}
		if raw[0] == 17 && length >= 14 {
			size := uint64(binary.LittleEndian.Uint16(raw[12:14]))
			var value uint64
			switch {
			case size == 0 || size == 0xffff:
			case size == 0x7fff:
				if length >= 32 {
					value = uint64(binary.LittleEndian.Uint32(raw[28:32])&0x7fffffff) << 20
				}
			case size&0x8000 != 0:
				value = (size & 0x7fff) << 10
			default:
				value = size << 20
			}
			if value > math.MaxUint64-total {
				return 0
			}
			total += value
		}
		if raw[0] == 127 {
			return total
		}
		end := bytes.Index(raw[length:], []byte{0, 0})
		if end < 0 {
			return 0
		}
		raw = raw[length+end+2:]
	}
	return total
}

func inspectP0Cgroup(f *P0HostFacts) error {
	raw, err := readP0Bounded("/proc/self/cgroup", 16384)
	if err != nil {
		return err
	}
	var relative string
	for _, line := range strings.Split(string(raw), "\n") {
		if strings.HasPrefix(line, "0::") {
			relative = strings.TrimPrefix(line, "0::")
		}
	}
	if relative == "" || !filepath.IsAbs(relative) || filepath.Clean(relative) != relative {
		return ErrPreflight
	}
	root := "/sys/fs/cgroup"
	current := filepath.Join(root, relative)
	if current != root && !strings.HasPrefix(current, root+"/") {
		return ErrPreflight
	}
	for depth := 0; depth < 128; depth++ {
		if raw, e := readP0Bounded(filepath.Join(current, "memory.max"), 128); e == nil {
			value := strings.TrimSpace(string(raw))
			if value != "max" {
				n, e := strconv.ParseUint(value, 10, 64)
				if e != nil || n == 0 {
					return ErrPreflight
				}
				if n < f.EffectiveMemoryBytes {
					f.EffectiveMemoryBytes = n
				}
			}
		} else if !os.IsNotExist(e) {
			return e
		}
		if raw, e := readP0Bounded(filepath.Join(current, "cpu.max"), 128); e == nil {
			fields := strings.Fields(string(raw))
			if len(fields) != 2 {
				return ErrPreflight
			}
			if fields[0] != "max" {
				q, e := strconv.ParseUint(fields[0], 10, 64)
				p, pe := strconv.ParseUint(fields[1], 10, 64)
				if e != nil || pe != nil || p == 0 || q == 0 {
					return ErrPreflight
				}
				n := q / p
				if n < uint64(f.CPUs) {
					f.CPUs = int(n)
				}
			}
		} else if !os.IsNotExist(e) {
			return e
		}
		if raw, e := readP0Bounded(filepath.Join(current, "cpuset.cpus.effective"), 4096); e == nil {
			n, e := p0CPUSetCount(strings.TrimSpace(string(raw)))
			if e != nil {
				return e
			}
			if n > 0 && n < f.CPUs {
				f.CPUs = n
			}
		} else if !os.IsNotExist(e) {
			return e
		}
		if current == root {
			return nil
		}
		current = filepath.Dir(current)
	}
	return ErrPreflight
}

func p0CPUSetCount(value string) (int, error) {
	if value == "" {
		return 0, nil
	}
	var total uint64
	var previous uint64
	first := true
	for _, part := range strings.Split(value, ",") {
		bounds := strings.Split(part, "-")
		if len(bounds) > 2 {
			return 0, ErrPreflight
		}
		a, e := strconv.ParseUint(bounds[0], 10, 20)
		if e != nil {
			return 0, ErrPreflight
		}
		b := a
		if len(bounds) == 2 {
			b, e = strconv.ParseUint(bounds[1], 10, 20)
			if e != nil || b < a {
				return 0, ErrPreflight
			}
		}
		if !first && a <= previous {
			return 0, ErrPreflight
		}
		first = false
		previous = b
		total += b - a + 1
	}
	if total > 1<<20 {
		return 0, ErrPreflight
	}
	return int(total), nil
}

func rootBlockCapacity(directory string) (uint64, error) {
	var st syscall.Stat_t
	if syscall.Stat(directory, &st) != nil {
		return 0, ErrPreflight
	}
	dev := uint64(st.Dev)
	major := ((dev >> 8) & 0xfff) | ((dev >> 32) & 0xfffff000)
	minor := (dev & 0xff) | ((dev >> 12) & 0xffffff00)
	node, err := filepath.EvalSymlinks(fmt.Sprintf("/sys/dev/block/%d:%d", major, minor))
	if err != nil {
		return 0, err
	}
	if !strings.HasPrefix(node, "/sys/devices/") {
		return 0, ErrPreflight
	}
	// The filesystem may sit on a root partition; use its parent disk capacity.
	if _, err := os.Stat(filepath.Join(node, "partition")); err == nil {
		node = filepath.Dir(node)
	}
	raw, err := readP0Bounded(filepath.Join(node, "size"), 128)
	if err != nil {
		return 0, err
	}
	n, err := strconv.ParseUint(strings.TrimSpace(string(raw)), 10, 64)
	if err != nil || n > math.MaxUint64/512 {
		return 0, ErrPreflight
	}
	return n * 512, nil
}
