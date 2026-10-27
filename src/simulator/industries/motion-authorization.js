// Rendering may reconstruct a stopped checkpoint once. Further motion needs
// an energized output or an actual simulation advance (the manual step button
// advances and pauses before the renderer receives the resulting snapshot).
export function createMotionAuthorization() {
  let previous;
  return snapshot => {
    const s=snapshot, key=[s.scope,s.bottleTotal??s.total,s.unit?.product].join('|');
    const initialize=!previous||key!==previous.key||
      Number.isFinite(s.elapsed)&&Number.isFinite(previous.elapsed)&&s.elapsed<previous.elapsed;
    const advanced=!!previous&&Number.isFinite(s.elapsed)&&
      Number.isFinite(previous.elapsed)&&s.elapsed>previous.elapsed;
    const telemetry=typeof s.running==='boolean'||!!s.outputs;
    const safe=!s.emergency&&s.guard!==false&&!s.obstruction&&!s.fault;
    const old=previous;
    previous={key,elapsed:s.elapsed,step:s.step?.id,phase:s.phase,running:s.running};
    return {initialize,advanced,
      allows(output) {
        if(initialize)return true;
        if(!safe)return false;
        if(!telemetry)return true;
        if(s.running)return s.outputs?s.outputs[output]===true:true;
        return advanced;
      },
      ended(step) {
        return !!old&&old.step===step&&old.phase==='operating'&&
          (s.step?.id!==step||s.phase!=='operating')&&safe&&
          (!telemetry||advanced||old.running===true);
      }
    };
  };
}
