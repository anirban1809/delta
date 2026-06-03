#include <stdint.h>
#include <stdbool.h>

int32_t delta_main();

int32_t delta_main() {
    if (true) {
        return 1;
    } else {
        return 2;
    }
}

int main() {
    return (int)delta_main();
}
