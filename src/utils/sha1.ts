export async function computeGitBlobSha(
	content: ArrayBuffer,
): Promise<string> {
	const header = `blob ${content.byteLength}\0`;
	const encoder = new TextEncoder();
	const headerBytes = encoder.encode(header);

	const combined = new Uint8Array(
		headerBytes.byteLength + content.byteLength,
	);
	combined.set(headerBytes, 0);
	combined.set(new Uint8Array(content), headerBytes.byteLength);

	const hashBuffer = await crypto.subtle.digest("SHA-1", combined);
	const hashArray = new Uint8Array(hashBuffer);
	return Array.from(hashArray)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
