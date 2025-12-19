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
  const result = await dockerRun(["version", "--format", "{{.Server.Version}}"]);
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

/**
 * Stop a container with the specified timeout
 * @param containerId - Container ID or name
 * @param timeout - Timeout in seconds for graceful stop (default: 30)
 * @returns true if stopped successfully, false otherwise
 */
export async function stopContainer(containerId: string, timeout: number = 30): Promise<boolean> {
  logger.debug(`Stopping container ${containerId} with timeout ${timeout}s`);
  const result = await dockerRun(["stop", "-t", timeout.toString(), containerId]);
  if (!result.success) {
    logger.error(`Failed to stop container ${containerId}: ${result.stderr}`);
  }
  return result.success;
}

/**
 * Start a previously stopped container
 * @param containerId - Container ID or name
 * @returns true if started successfully, false otherwise
 */
export async function startContainer(containerId: string): Promise<boolean> {
  logger.debug(`Starting container ${containerId}`);
  const result = await dockerRun(["start", containerId]);
  if (!result.success) {
    logger.error(`Failed to start container ${containerId}: ${result.stderr}`);
  }
  return result.success;
}

/**
 * Start a container with retry logic
 * @param containerId - Container ID or name
 * @param retries - Number of retry attempts (default: 3)
 * @param retryDelay - Delay between retries in ms (default: 1000)
 * @returns true if started successfully after retries, false otherwise
 */
export async function startContainerWithRetry(
  containerId: string,
  retries: number = 3,
  retryDelay: number = 1000,
): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await dockerRun(["start", containerId]);
    if (result.success) {
      logger.debug(`Container ${containerId} started successfully`);
      return true;
    }

    if (attempt < retries) {
      logger.warn(
        `Failed to start container ${containerId} (attempt ${attempt}/${retries}), retrying in ${retryDelay}ms...`,
      );
      await Bun.sleep(retryDelay);
    }
  }

  logger.error(`Failed to start container ${containerId} after ${retries} attempts`);
  return false;
}

/**
 * Get the restart policy of a container
 * @returns Restart policy name: "no", "always", "on-failure", "unless-stopped", or null if not found
 */
export async function getContainerRestartPolicy(containerId: string): Promise<string | null> {
  const result = await dockerRun([
    "inspect",
    "--format",
    "{{.HostConfig.RestartPolicy.Name}}",
    containerId,
  ]);

  if (!result.success) {
    logger.debug(`Failed to get restart policy for container ${containerId}: ${result.stderr}`);
    return null;
  }

  return result.stdout || null;
}

/**
 * Check if a restart policy may cause the container to auto-restart
 * (restart: always or restart: unless-stopped)
 */
export function hasAutoRestartPolicy(restartPolicy: string): boolean {
  return restartPolicy === "always" || restartPolicy === "unless-stopped";
}
