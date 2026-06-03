package toolchain

import (
	"os/exec"
)

type ErrClangMissing struct {
	Message string
}

func FindClang() (string, *ErrClangMissing) {
	p, err := exec.LookPath("clang")

	if err != nil {
		return "", &ErrClangMissing{
			Message: "failed to find clang",
		}
	}

	return p, nil
}
