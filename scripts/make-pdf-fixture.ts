import { writeFileSync, readFileSync } from 'node:fs';
import { resumeToPdf } from '../src/lib/pdf';
resumeToPdf(readFileSync('tests/fixtures/resume.txt', 'utf8'), 'Resume').then((b) => writeFileSync('tests/fixtures/resume.pdf', b));
