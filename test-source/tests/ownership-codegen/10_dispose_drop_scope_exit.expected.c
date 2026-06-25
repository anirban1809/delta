#include <stdint.h>
#include <stdbool.h>

typedef struct delta__Handle {
	int32_t id;
} delta__Handle;

void delta__Handle_dispose(delta__Handle* handle);
void delta__Handle_drop(delta__Handle* value);
int32_t delta_main();

void delta__Handle_dispose(delta__Handle* handle) {
	handle->id = 0;
}

void delta__Handle_drop(delta__Handle* value) {
	delta__Handle_dispose(value);
}

int32_t delta_main() {
	delta__Handle handle = (delta__Handle){ .id = 7 };
	delta__Handle_drop(&handle);
	return 0;
}

int main() {
	return (int)delta_main();
}
