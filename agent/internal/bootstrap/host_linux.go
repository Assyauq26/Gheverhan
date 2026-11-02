//go:build linux

package bootstrap

import (
	"context"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"syscall"
	"time"
)

func InspectHost(stateDirectory string) (HostFacts, error) {
	f := HostFacts{OS: runtime.GOOS, Arch: runtime.GOARCH, CPUs: runtime.NumCPU()}
	release, err := os.Open("/etc/os-release")
	if err != nil {
		return f, ErrPreflight
	}
	f.Release, err = ParseOSRelease(release)
	release.Close()
	if err != nil {
		return f, err
	}
	memory, err := os.Open("/proc/meminfo")
	if err != nil {
		return f, ErrPreflight
	}
	f.MemoryBytes, err = MemoryBytes(memory)
	memory.Close()
	if err != nil {
		return f, err
	}
	var disk syscall.Statfs_t
	if syscall.Statfs(stateDirectory, &disk) != nil {
		return f, ErrPreflight
	}
	f.FreeBytes = disk.Bavail * uint64(disk.Bsize)
	f.FreeInodes = disk.Ffree
	// Inspect only the local socket, never inherited remote Docker context.
	if _, e := os.Stat("/var/run/docker.sock"); e == nil {
		docker, e := exec.LookPath("docker")
		if e != nil {
			return f, ErrPreflight
		}
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		cmd := exec.CommandContext(ctx, docker, "--host", "unix:///var/run/docker.sock", "ps", "--all", "--quiet")
		cmd.Env = []string{"PATH=/usr/bin:/bin", "HOME=/nonexistent"}
		output, e := cmd.Output()
		cancel()
		if e != nil {
			return f, ErrPreflight
		}
		f.ExistingServices = len(strings.TrimSpace(string(output))) > 0
	}
	for _, name := range []string{"/etc/caddy/Caddyfile", "/var/lib/postgresql"} {
		if _, e := os.Stat(name); e == nil {
			f.ExistingServices = true
		}
	}
	f.PortsAvailable = true
	listeners := []net.Listener{}
	defer func() {
		for _, l := range listeners {
			l.Close()
		}
	}()
	for _, port := range []string{"0.0.0.0:80", "0.0.0.0:443"} {
		l, e := net.Listen("tcp4", port)
		if e != nil {
			f.PortsAvailable = false
			break
		}
		listeners = append(listeners, l)
	}
	return f, ValidateHost(f)
}
