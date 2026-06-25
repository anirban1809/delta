#include <stdint.h>
#include <stdbool.h>

typedef struct delta__Counter {
	int32_t value;
} delta__Counter;

void increment(delta__Counter* counter);
int32_t delta_main();

void increment(delta__Counter* counter) {
	counter->value = (counter->value + 1);
}

int32_t delta_main() {
	delta__Counter counter = (delta__Counter){ .value = 7 };
	increment(&counter);
	return counter.value;
}

int main() {
	return (int)delta_main();
}
