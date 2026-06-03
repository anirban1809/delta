#include <stdint.h>
#include <stdbool.h>

int32_t gcd(int32_t a, int32_t b);
int32_t delta_main();

int32_t gcd(int32_t a, int32_t b) {
    int32_t x = a;
    int32_t y = b;
    while (x != y) {
        if (x > y) {
            x = x - y;
        } else {
            y = y - x;
        }
    }
    return x;
}

int32_t delta_main() {
    return gcd(48, 18);
}

int main() {
    return (int)delta_main();
}
