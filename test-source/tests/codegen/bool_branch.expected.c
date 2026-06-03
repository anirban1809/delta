#include <stdint.h>
#include <stdbool.h>

int32_t pick(bool flag, int32_t a, int32_t b);
int32_t delta_main();

int32_t pick(bool flag, int32_t a, int32_t b) {
    if (flag) {
        return a;
    } else {
        return b;
    }
}

int32_t delta_main() {
    return pick(true, 10, 20);
}

int main() {
    return (int)delta_main();
}
