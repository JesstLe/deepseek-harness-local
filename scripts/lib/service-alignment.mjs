// CLI and desktop share one code-only hash/CAS/rollback transaction.
import core from '../../desktop/app/service-code.cjs';
export const {hash,INERT_EXTRAS,versionAt,planAlignment,assertBefore,applyAlignment,restoreAlignment,verifyAligned}=core;
