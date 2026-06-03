#include <stdint.h>
#include <stdbool.h>

int32_t delta_main();

int32_t delta_main() {
    return 42;
}

int main() {
    return (int)delta_main();
}
