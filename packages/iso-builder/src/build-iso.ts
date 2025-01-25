import { execa } from 'execa';
import type { ExecaError } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILD_DIR = path.join(__dirname, '../build');
const ISO_DIR = path.join(BUILD_DIR, 'iso');
const CHROOT_DIR = path.join(BUILD_DIR, 'chroot');

async function setupBuildEnvironment() {
  const spinner = ora('Setting up build environment').start();
  try {
    // Remove existing build directory if it exists
    if (await fs.pathExists(BUILD_DIR)) {
      spinner.text = 'Removing existing build directory...';
      await fs.remove(BUILD_DIR);
    }

    // Create build directories with proper permissions
    spinner.text = 'Creating build directories...';
    await fs.ensureDir(BUILD_DIR);
    await fs.ensureDir(ISO_DIR);
    await fs.ensureDir(CHROOT_DIR);
    await fs.ensureDir(path.join(ISO_DIR, 'boot/grub'));
    await fs.ensureDir(path.join(ISO_DIR, 'live'));

    // Set proper permissions
    spinner.text = 'Setting permissions...';
    await execa('chmod', ['-R', '777', BUILD_DIR]);

    // Verify directories were created
    const dirs = [BUILD_DIR, ISO_DIR, CHROOT_DIR];
    for (const dir of dirs) {
      if (!await fs.pathExists(dir)) {
        throw new Error(`Failed to create directory: ${dir}`);
      }
    }

    spinner.succeed('Build environment setup complete');
    
    // Log directory structure
    console.log('\nBuild directory structure:');
    const { stdout } = await execa('tree', [BUILD_DIR]);
    console.log(stdout);
  } catch (error) {
    spinner.fail(`Failed to setup build environment: ${error}`);
    console.error('Full error:', error);
    throw error;
  }
}

async function downloadBaseSystem() {
  const spinner = ora('Downloading Debian base system').start();
  try {
    await execa('debootstrap', [
      '--arch=amd64',
      '--variant=minbase',
      'bookworm',
      CHROOT_DIR,
      'http://deb.debian.org/debian'
    ]);
    spinner.succeed('Base system downloaded');
  } catch (error) {
    spinner.fail(`Failed to download base system: ${error}`);
    throw error;
  }
}

async function configureSystem() {
  const spinner = ora('Configuring system').start();
  try {
    // Copy system configuration files
    await fs.copy(
      path.join(__dirname, '../templates/system'),
      path.join(CHROOT_DIR, 'etc')
    );

    // Configure hostname
    await fs.writeFile(
      path.join(CHROOT_DIR, 'etc/hostname'),
      'nestos'
    );

    // Configure network interfaces
    await fs.writeFile(
      path.join(CHROOT_DIR, 'etc/network/interfaces'),
      'auto lo\niface lo inet loopback\n'
    );

    // Configure package sources
    await fs.writeFile(
      path.join(CHROOT_DIR, 'etc/apt/sources.list'),
      'deb http://deb.debian.org/debian bookworm main contrib non-free\n' +
      'deb http://security.debian.org/debian-security bookworm-security main contrib non-free\n'
    );

    spinner.succeed('System configured');
  } catch (error) {
    spinner.fail(`Failed to configure system: ${error}`);
    throw error;
  }
}

async function installPackages() {
  const spinner = ora('Installing required packages').start();
  try {
    const packages = [
      'linux-image-amd64',
      'systemd-sysv',
      'grub-pc',
      'network-manager',
      'openssh-server',
      'curl',
      'docker.io',
      'mdadm',
      'smartmontools',
      'samba',
      'nfs-kernel-server',
      'nodejs',
      'npm'
    ];

    await execa('chroot', [
      CHROOT_DIR,
      'apt-get', 'update'
    ]);

    await execa('chroot', [
      CHROOT_DIR,
      'apt-get', 'install', '-y',
      ...packages
    ]);

    spinner.succeed('Packages installed');
  } catch (error) {
    spinner.fail(`Failed to install packages: ${error}`);
    throw error;
  }
}

async function installNestOSComponents() {
  const spinner = ora('Installing NestOS components').start();
  try {
    // Copy built system service
    await fs.copy(
      path.join(__dirname, '../../system-service/dist'),
      path.join(CHROOT_DIR, 'opt/nestos/system-service')
    );

    // Copy built control panel
    await fs.copy(
      path.join(__dirname, '../../control-panel/dist'),
      path.join(CHROOT_DIR, 'opt/nestos/control-panel')
    );

    // Copy systemd service files
    await fs.copy(
      path.join(__dirname, '../templates/services'),
      path.join(CHROOT_DIR, 'etc/systemd/system')
    );

    // Enable services
    await execa('chroot', [
      CHROOT_DIR,
      'systemctl', 'enable',
      'nestos-system.service',
      'nestos-control-panel.service'
    ]);

    spinner.succeed('NestOS components installed');
  } catch (error) {
    spinner.fail(`Failed to install NestOS components: ${error}`);
    throw error;
  }
}

async function createISO() {
  const spinner = ora('Creating ISO image').start();
  try {
    // Generate initramfs
    spinner.text = 'Generating initramfs...';
    const initramfsResult = await execa('chroot', [
      CHROOT_DIR,
      'update-initramfs', '-u', '-v'  // Added verbose flag
    ]);
    console.log('Initramfs output:', initramfsResult.stdout);

    // Find and copy kernel and initrd
    spinner.text = 'Copying kernel and initrd...';
    const bootFiles = await fs.readdir(path.join(CHROOT_DIR, 'boot'));
    
    const kernelFile = bootFiles.find(file => file.startsWith('vmlinuz-'));
    const initrdFile = bootFiles.find(file => file.startsWith('initrd.img-'));
    
    if (!kernelFile || !initrdFile) {
      throw new Error('Kernel or initrd files not found');
    }

    await fs.copy(
      path.join(CHROOT_DIR, 'boot', kernelFile),
      path.join(ISO_DIR, 'boot/vmlinuz')
    );
    await fs.copy(
      path.join(CHROOT_DIR, 'boot', initrdFile),
      path.join(ISO_DIR, 'boot/initrd.img')
    );

    // Create GRUB configuration
    spinner.text = 'Creating GRUB configuration...';
    const grubConfig = `
set timeout=5
set default=0

menuentry "NestOS" {
  linux /boot/vmlinuz root=/dev/ram0 quiet
  initrd /boot/initrd.img
}
`;
    await fs.writeFile(path.join(ISO_DIR, 'boot/grub/grub.cfg'), grubConfig);

    // Create squashfs of the system
    spinner.text = 'Creating squashfs filesystem...';
    await fs.ensureDir(path.join(ISO_DIR, 'live'));
    const squashfsResult = await execa('mksquashfs', [
      CHROOT_DIR,
      path.join(ISO_DIR, 'live/filesystem.squashfs'),
      '-comp', 'xz',
      '-info'  // Added info flag for more output
    ]);
    console.log('Squashfs creation output:', squashfsResult.stdout);

    // List files before creating ISO
    spinner.text = 'Verifying ISO directory structure...';
    const { stdout: treeOutput } = await execa('tree', [ISO_DIR]);
    console.log('ISO directory structure:', treeOutput);

    // Create ISO
    spinner.text = 'Creating final ISO image...';
    const grubResult = await execa('grub-mkrescue', [
      '-o', path.join(BUILD_DIR, 'nestos.iso'),
      ISO_DIR,
      '--verbose'
    ]);
    console.log('GRUB mkrescue output:', grubResult.stdout);

    // Verify ISO was created and get its size
    const isoExists = await fs.pathExists(path.join(BUILD_DIR, 'nestos.iso'));
    if (!isoExists) {
      throw new Error('ISO file was not created');
    }

    const isoStats = await fs.stat(path.join(BUILD_DIR, 'nestos.iso'));
    console.log(`ISO file created successfully. Size: ${(isoStats.size / 1024 / 1024).toFixed(2)} MB`);

    spinner.succeed('ISO image created successfully');
  } catch (error) {
    spinner.fail(`Failed to create ISO image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Full error details:');
    
    if (error && typeof error === 'object') {
      // Safe type assertion since we checked it's an object
      const err = error as { [key: string]: unknown };
      if ('stdout' in err) console.error('Command output:', err.stdout);
      if ('stderr' in err) console.error('Command error:', err.stderr);
    }
    
    throw error;
  }
}

export async function buildIso() {
  console.log(chalk.blue('Starting NestOS ISO build process...'));

  try {
    await setupBuildEnvironment();
    await downloadBaseSystem();
    await configureSystem();
    await installPackages();
    await installNestOSComponents();
    await createISO();

    console.log(chalk.green('\nBuild completed successfully!'));
    console.log(chalk.white(`ISO image available at: ${path.join(BUILD_DIR, 'nestos.iso')}`));
  } catch (error) {
    console.error(chalk.red('\nBuild failed:'), error);
    process.exit(1);
  }
}