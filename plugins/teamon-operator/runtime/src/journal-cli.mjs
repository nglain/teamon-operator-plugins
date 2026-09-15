import { readFile } from 'node:fs/promises';
import { WorkJournal } from './work-journal.mjs';

// Explicit local profile, not server authentication. Input files avoid shell-escaped notes.
const [root,owner,company,action,inputFile]=process.argv.slice(2);
if(!root||!owner||!company||!['open','update','observe','note','read','list','patterns'].includes(action))throw Error('Usage: journal-cli.mjs ROOT LOCAL_OWNER COMPANY open|update|observe|note|read|list|patterns [INPUT_JSON]');
const input=inputFile?JSON.parse(await readFile(inputFile,'utf8')):{};
const journal=new WorkJournal(root,owner);
try{process.stdout.write(JSON.stringify(journal[action](company,input),null,2)+'\n')}finally{journal.close()}
