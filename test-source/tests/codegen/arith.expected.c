#include <stdint.h>
#include <stdbool.h>

int32_t delta_main();

int32_t delta_main() {
    return 10 + 20 * 2 - 5;
}

int main() {
    return (int)delta_main();
}
