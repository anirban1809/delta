#include <stdint.h>
#include <stdbool.h>

typedef struct delta__Counter {
	int32_t value;
} delta__Counter;

int32_t add(const delta__Counter* left, const delta__Counter* right);
void increment(delta__Counter* counter);
int32_t delta_main();

int32_t add(const delta__Counter* left, const delta__Counter* right) {
	return (left->value + right->value);
}

void increment(delta__Counter* counter) {
	counter->value = (counter->value + 1);
}

int32_t delta_main() {
	delta__Counter counter = (delta__Counter){ .value = 7 };
	const int32_t sum = add(&counter, &counter);
	increment(&counter);
	return (sum + counter.value);
}

int main() {
	return (int)delta_main();
}
