'use strict';

// Admin accounts.
//
//   npm run user -- add <email>        Create an account. Asks for a password (or reads one piped in).
//   npm run user -- password <email>   Set a new password; signs the account out everywhere.
//   npm run user -- remove <email>     Delete the account.
//   npm run user -- list               List accounts.
//
// Add --generate to `add` or `password` to create a strong password and print it once.

const crypto = require('crypto');
const readline = require('readline');
const config = require('../server/config');
const db = require('../server/db');
const User = require('../server/models/User');
const { hashPassword, passwordProblem } = require('../server/lib/passwords');

const USAGE = [
  'Usage:',
  '  npm run user -- add <email> [--generate]',
  '  npm run user -- password <email> [--generate]',
  '  npm run user -- remove <email>',
  '  npm run user -- list',
].join('\n');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function readPiped() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.split(/\r?\n/)[0]));
  });
}

async function choosePassword(generate) {
  if (generate) {
    const password = crypto.randomBytes(18).toString('base64').replace(/[+/=]/g, '').slice(0, 22);
    return { password, generated: true };
  }
  if (!process.stdin.isTTY) {
    const password = await readPiped();
    const problem = passwordProblem(password);
    if (problem) throw new Error('Password not accepted. ' + problem);
    return { password, generated: false };
  }
  for (;;) {
    const password = await askHidden('Password (at least 12 characters): ');
    const problem = passwordProblem(password);
    if (problem) {
      console.log(problem);
      continue;
    }
    if ((await askHidden('Repeat it: ')) !== password) {
      console.log("The passwords don't match. Try again.");
      continue;
    }
    return { password, generated: false };
  }
}

function report(email, choice, verb) {
  console.log(verb + ' ' + email + '.');
  if (choice.generated) console.log('Password (shown once): ' + choice.password);
}

async function main() {
  const args = process.argv.slice(2);
  const generate = args.indexOf('--generate') !== -1;
  const [command, rawEmail] = args.filter((arg) => arg !== '--generate');
  const email = String(rawEmail || '').trim().toLowerCase();

  if (!command || (command !== 'list' && !EMAIL.test(email))) {
    console.log(USAGE);
    process.exitCode = command ? 1 : 0;
    return;
  }

  await db.connect(config.mongoUri);
  try {
    if (command === 'list') {
      const users = await User.find().sort({ email: 1 }).lean();
      if (!users.length) console.log('No admin accounts yet.');
      users.forEach((user) => {
        const last = user.lastLoginAt ? 'last signed in ' + user.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never signed in';
        console.log(user.email + '  (' + last + ')');
      });
    } else if (command === 'add') {
      if (await User.exists({ email })) throw new Error(email + ' already has an account. To change its password: npm run user -- password ' + email);
      const choice = await choosePassword(generate);
      await User.create({ email, passwordHash: await hashPassword(choice.password) });
      report(email, choice, 'Created an admin account for');
    } else if (command === 'password') {
      const user = await User.findOne({ email });
      if (!user) throw new Error('No account for ' + email + '.');
      const choice = await choosePassword(generate);
      user.passwordHash = await hashPassword(choice.password);
      user.sessionVersion += 1;
      await user.save();
      report(email, choice, 'Changed the password for');
    } else if (command === 'remove') {
      const result = await User.deleteOne({ email });
      console.log(result.deletedCount ? 'Removed ' + email + '.' : 'No account for ' + email + '.');
    } else {
      console.log(USAGE);
      process.exitCode = 1;
    }
  } finally {
    await db.disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
