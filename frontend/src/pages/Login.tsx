import { useEffect, useState, FormEvent } from 'react';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const { login, init, initialized, authRequired } = useAuthStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  // While the auth-required status is still being fetched, show a neutral loader.
  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-study-bg">
        <div className="text-parchment-dim/50 text-sm">加载中…</div>
      </div>
    );
  }

  // If the backend hasn't enabled auth, no login is needed — render nothing;
  // the parent App will mount the real UI.
  if (!authRequired) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const ok = await login(password);
    setSubmitting(false);
    if (!ok) setError('密码错误，请重试');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-study-bg px-4">
      <div className="w-full max-w-sm card">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-parchment mb-1">NovelForge</h1>
          <p className="text-sm text-parchment-dim/60">请输入管理密码以进入工作台</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            className="input w-full"
            placeholder="管理密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            disabled={submitting}
          />
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button type="submit" className="btn-primary w-full" disabled={submitting || !password}>
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
