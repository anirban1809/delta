#include <stdint.h>
#include <stdbool.h>

bool is_even(int32_t n);
bool is_odd(int32_t n);
int32_t delta_main();

bool is_even(int32_t n) {
    if (n == 0) {
        return true;
    } else {
        return is_odd(n - 1);
    }
}

bool is_odd(int32_t n) {
    if (n == 0) {
        return false;
    } else {
        return is_even(n - 1);
    }
}

int32_t delta_main() {
    if (is_even(10)) {
        return 1;
    } else {
        return 0;
    }
}

int main() {
    return (int)delta_main();
}
