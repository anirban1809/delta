/* Generated C (illustrative; #line omitted) */
#include <stdint.h>

int32_t classify(int32_t n) {
    if (n > 0)      { return 1; }
    else if (n < 0) { return (int32_t)0 - 1; }
    else            { return 0; }
}

int32_t main(void) {
    return classify(5);
}
