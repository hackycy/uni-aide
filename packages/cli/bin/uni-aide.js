#!/usr/bin/env node
import('../dist/cli.js')
  .then(r => r.bootstrap())
