/**
 * Docker CLI client wrapper using Bun.$
 */

import { logger } from "../utils/logger";

export interface DockerRunResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a Docker command and return the result
 */
export async function dockerRun(args: string[]): Promise<DockerRunResult> {
  try {
    const result = await Bun.$`docker ${args}`.quiet();
    return {
      success: result.exitCode === 0,
      stdout: result.stdout.toString().trim(),
      stderr: result.stderr.toString().trim(),
      exitCode: result.exitCode,
    };
  } catch (error) {
    // Bun.$ throws on non-zero exit codes by default
    if (error && typeof error === "object" && "exitCode" in error) {
      const shellError = error as {
        exitCode: number;
        stdout: Buffer;
        stderr: Buffer;
      };
      return {
        success: false,
        stdout: shellError.stdout?.toString().trim() ?? "",
        stderr: shellError.stderr?.toString().trim() ?? "",
        exitCode: shellError.exitCode,
      };
    }
    throw error;
  }
}

/**
 * Check if Docker is available and running
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const result = await dockerRun(["info"]);
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Get Docker version information
 */
export async function getDockerVersion(): Promise<string | null> {
  const result = await dockerRun([
    "version",
    "--format",
    "{{.Server.Version}}",
  ]);
  if (result.success) {
    return result.stdout;
  }
  return null;
}

/**
 * Run a container with the specified options
 */
export async function runContainer(options: {
  image: string;
  command: string[];
  volumes?: Array<{ source: string; target: string; readonly?: boolean }>;
  remove?: boolean;
}): Promise<DockerRunResult> {
  const args: string[] = ["run"];

  if (options.remove !== false) {
    args.push("--rm");
  }

  if (options.volumes) {
    for (const vol of options.volumes) {
      const mountSpec = vol.readonly
        ? `${vol.source}:${vol.target}:ro`
        : `${vol.source}:${vol.target}`;
      args.push("-v", mountSpec);
    }
  }

  args.push(options.image);
  args.push(...options.command);

  logger.debug(`Running Docker container: docker ${args.join(" ")}`);
  return dockerRun(args);
}

/**
 * Pull a Docker image if not present
 */
export async function ensureImage(image: string): Promise<boolean> {
  // Check if image exists locally
  const inspectResult = await dockerRun(["image", "inspect", image]);
  if (inspectResult.success) {
    return true;
  }

  // Pull the image
  logger.info(`Pulling Docker image: ${image}`);
  const pullResult = await dockerRun(["pull", image]);
  return pullResult.success;
}
