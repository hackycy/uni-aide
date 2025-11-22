import process from 'node:process'
import cac from 'cac'
import { version } from '../../../package.json'

export async function bootstrap() {
  try {
    loadCliArgs()
  }
  catch (err) {
    errorHandler(err as Error)
  }
}

function loadCliArgs(argv = process.argv) {
  const cli = cac('uni-pages')

  cli.version(version)
    .option('-i, --input-dir <dir>', 'Specify the input directory')
    .option('-c, --config-source <file>', 'Specify the config source file or directory')
    .option('-o, --out-dir <dir>', 'Specify the output directory for pages.json')
    .option('-s, --scan-dir [...dirs]', 'Specify directories to scan for pages')
    .option('-e, --exclude [...patterns]', 'Specify glob patterns to exclude during scanning')
    .help()

  const result = cli.parse(argv)
  console.log(result)
}

function errorHandler(error: Error): never {
  console.error(error.message)
  return process.exit(9)
}
