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
	delta__Handle current = (delta__Handle){ .id = 1 };
	delta__Handle next = (delta__Handle){ .id = 2 };
	delta__Handle __delta_replacement_0 = next;
	delta__Handle_drop(&current);
	current = __delta_replacement_0;
	int32_t __delta_return_0 = current.id;
	delta__Handle_drop(&current);
	return __delta_return_0;
}

int main() {
	return (int)delta_main();
}
