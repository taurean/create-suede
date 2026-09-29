const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Returns an error message, or undefined when the name is usable as a directory and package name. */
export function validateProjectName(name: string | undefined): string | undefined {
	if (!name) return 'A project name is required.';
	if (name.length > 214) return 'Project names must be 214 characters or fewer.';
	if (!PROJECT_NAME_PATTERN.test(name)) {
		return 'Use lowercase letters, digits, and hyphens, starting with a letter or digit.';
	}
	return undefined;
}
