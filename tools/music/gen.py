"""Generate one Naija Road Rush music track with ACE-Step 1.5 on CPU.

Usage: python gen.py <ace_repo_dir> <track_id> <out_dir> [duration_seconds]
Writes <out_dir>/<track_id>.wav (converted to MP3 by the workflow).
ACE-Step 1.5 is MIT licensed and its outputs may be used commercially.
"""
import json, os, sys, time, glob, shutil

ace, track_id, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
duration = float(sys.argv[4]) if len(sys.argv) > 4 else 100.0
spec = json.load(open(os.path.join(os.path.dirname(__file__), 'tracks.json')))[track_id]
sys.path.insert(0, ace); os.chdir(ace)

import torch
torch.set_num_threads(os.cpu_count() or 4)
from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music

t0 = time.time()
dit = AceStepHandler()
msg, ok = dit.initialize_service(project_root=ace, config_path='acestep-v15-turbo', device='cpu')
print('DiT init:', ok, msg, flush=True)
if not ok: sys.exit(1)

llm, use_lm = LLMHandler(), os.environ.get('ACE_USE_LM', '1') == '1'
if use_lm:
    try:
        msg, ok = llm.initialize(checkpoint_dir=os.path.join(ace, 'checkpoints'), lm_model_path='acestep-5Hz-lm-0.6B', backend='pt', device='cpu')
        print('LM init:', ok, msg, flush=True); use_lm = ok
    except Exception as e:
        print('LM init failed, continuing without LM:', e, flush=True); use_lm = False
print(f'init took {time.time() - t0:.0f}s', flush=True)

params = GenerationParams(caption=spec['caption'], lyrics='[Instrumental]', instrumental=True, bpm=spec['bpm'], keyscale=spec['key'],
                          timesignature='4', duration=duration, inference_steps=8, shift=3.0, thinking=use_lm)
config = GenerationConfig(batch_size=1, audio_format='wav', use_random_seed=False, seeds=[int(os.environ.get('ACE_SEED', '1234'))])
os.makedirs(out_dir, exist_ok=True); tmp = os.path.join(out_dir, '_tmp_' + track_id)
t1 = time.time()
res = generate_music(dit, llm, params, config, save_dir=tmp)  # an uninitialised LLMHandler means 'no LM'
print(f'generation took {time.time() - t1:.0f}s success={res.success} err={getattr(res, "error", None)}', flush=True)
if not res.success: sys.exit(1)
src = res.audios[0]['path'] if res.audios and res.audios[0].get('path') else (glob.glob(os.path.join(tmp, '**', '*.wav'), recursive=True) or [None])[0]
shutil.move(src, os.path.join(out_dir, track_id + '.wav')); shutil.rmtree(tmp, ignore_errors=True)
print('wrote', os.path.join(out_dir, track_id + '.wav'), flush=True)
