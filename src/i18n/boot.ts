// T2b: imported first by main.tsx, so a kept language pack is in place before any screen module reads a text. Costs one
// localStorage read when no pack is kept (English only).
import {applyKeptAtStart} from './pack';

applyKeptAtStart();
