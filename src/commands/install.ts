import { lstat, mkdir, realpath, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { templates } from "../generated/templates.js";

export async function installCommand(): Promise<void> {
	console.log("Installing Ralph...\n");

	let created = 0;
	let skipped = 0;

	// Copy embedded template files
	for (const [relPath, content] of Object.entries(templates)) {
		if (await Bun.file(relPath).exists()) {
			console.log(`  skipped: ${relPath} (already exists)`);
			skipped++;
			continue;
		}

		const dir = dirname(relPath);
		if (dir !== ".") {
			await mkdir(dir, { recursive: true });
		}

		await Bun.write(relPath, content);
		console.log(`  created: ${relPath}`);
		created++;
	}

	// Symlink the ralph binary
	const linked = await symlinkBinary();
	if (linked) {
		created++;
	} else {
		skipped++;
	}

	console.log();
	console.log(`Done: ${created} created, ${skipped} skipped`);

	// Show usage from the installed binary
	console.log();
	const dest = join("scripts", "ralph", "ralph");
	const proc = Bun.spawn([dest, "--help"], {
		stdout: "inherit",
		stderr: "inherit",
	});
	await proc.exited;
}

async function symlinkBinary(): Promise<boolean> {
	const dest = join("scripts", "ralph", "ralph");

	try {
		await lstat(dest);
		console.log(`  skipped: ${dest} (already exists)`);
		return false;
	} catch {
		// File doesn't exist, proceed
	}

	let exe = process.execPath;
	try {
		exe = await realpath(exe);
	} catch {
		// Ignore resolution errors
	}

	await mkdir(join("scripts", "ralph"), { recursive: true });

	try {
		await symlink(exe, dest);
		console.log(`  symlink: ${dest} -> ${exe}`);
		return true;
	} catch (err) {
		throw new Error(`creating symlink: ${err}`);
	}
}
