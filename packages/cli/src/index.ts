#!/usr/bin/env node

import { Command } from "commander";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";

const program = new Command();

program
	.name("aitk")
	.description("CLI for scaffolding full-stack AI projects")
	.version("0.1.0");

// Commands
program.addCommand(doctorCommand);
program.addCommand(initCommand);

program.parse();
