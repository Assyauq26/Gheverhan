package bootstrap

import (
	"bufio"
	"errors"
	"io"
	"strconv"
	"strings"
)

var ErrPreflight = errors.New("unsupported host or insufficient resources")

type HostFacts struct {
	OS               string
	Arch             string
	Release          string
	CPUs             int
	MemoryBytes      uint64
	FreeBytes        uint64
	FreeInodes       uint64
	PortsAvailable   bool
	ExistingServices bool
}

func ValidateHost(f HostFacts) error {
	if f.OS != "linux" || f.Arch != "amd64" || f.Release != "ubuntu:24.04" || f.CPUs < 2 || f.MemoryBytes < 4*1024*1024*1024 || f.FreeBytes < 40*1024*1024*1024 || f.FreeInodes < 10000 || !f.PortsAvailable || f.ExistingServices {
		return ErrPreflight
	}
	return nil
}
func ParseOSRelease(r io.Reader) (string, error) {
	values := map[string]string{}
	s := bufio.NewScanner(io.LimitReader(r, 65537))
	for s.Scan() {
		line := s.Text()
		if strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		if k == "ID" || k == "VERSION_ID" {
			if _, seen := values[k]; seen {
				return "", ErrPreflight
			}
			values[k] = strings.Trim(v, "\"")
		}
	}
	if s.Err() != nil || values["ID"] != "ubuntu" || values["VERSION_ID"] != "24.04" {
		return "", ErrPreflight
	}
	return "ubuntu:24.04", nil
}
func MemoryBytes(r io.Reader) (uint64, error) {
	s := bufio.NewScanner(io.LimitReader(r, 65537))
	for s.Scan() {
		v := strings.Fields(s.Text())
		if len(v) == 3 && v[0] == "MemTotal:" && v[2] == "kB" {
			n, e := strconv.ParseUint(v[1], 10, 64)
			if e != nil || n > 1<<50 {
				return 0, ErrPreflight
			}
			return n * 1024, nil
		}
	}
	return 0, ErrPreflight
}
