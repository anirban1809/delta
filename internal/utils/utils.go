package utils

func Map[T any, U any](ts []T, f func(T, int) U) []U {
	us := make([]U, len(ts))
	for i, v := range ts {
		us[i] = f(v, i)
	}
	return us
}

func Filter[T any](ts []T, f func(T, int) bool) []T {
	us := []T{}
	for i, v := range ts {
		if f(v, i) {
			us = append(us, ts[i])
		}
	}
	return us
}
