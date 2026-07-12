/* Generated C: build/<mode>/c/main.c (illustrative) — imports referenced via extern */
#include <stdint.h>

extern const int32_t delta__mathlib__BONUS;
extern int32_t delta__mathlib__square(int32_t);

int32_t main(void) {
    const int32_t area = delta__mathlib__square(5);
    return area + delta__mathlib__BONUS;
}
