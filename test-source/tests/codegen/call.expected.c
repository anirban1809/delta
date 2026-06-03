#include <stdint.h>
#include <stdbool.h>

int32_t add(int32_t a, int32_t b);
int32_t delta_main();

int32_t add(int32_t a, int32_t b) {
    return a + b;
}

int32_t delta_main() {
    return add(1, 2);
}

int main() {
    return (int)delta_main();
}
