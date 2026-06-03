#include <stdint.h>
#include <stdbool.h>

int32_t classify(int32_t x);
int32_t delta_main();

int32_t classify(int32_t x) {
    int32_t count = 0;
    int32_t i = 0;
    while (i < x) {
        if (i < 5) {
            count = count + 1;
        } else {
            if (i < 10) {
                count = count + 2;
            } else {
                count = count + 3;
            }
        }
        i = i + 1;
    }
    return count;
}

int32_t delta_main() {
    return classify(15);
}

int main() {
    return (int)delta_main();
}
