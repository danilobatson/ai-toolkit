import { Command } from "commander";

export const initCommand = new Command("init")
	.description("Scaffold a new full-stack AI project")
	.argument("[name]", "Project name")
	.action(() => {
		console.log("aitk init is coming in v2. Currently available: aitk doctor");
		process.exit(0);
	});
