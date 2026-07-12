/* Generated C (illustrative; #line omitted) */
#include <stdint.h>

int32_t main(void) {
    int32_t sum = 0;
    for (int32_t i = 0; i < 5; i = i + 1) {
        if (i == 2) {
            continue;
        }
        sum = sum + i;
    }
    return sum;
}
