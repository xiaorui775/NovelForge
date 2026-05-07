import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center animate-fade-in">
      <div className="text-center">
        <h1 className="font-display text-8xl font-bold text-ink/20 mb-4">404</h1>
        <p className="font-display text-xl text-parchment mb-2">页面不存在</p>
        <p className="text-parchment-dim/50 text-sm mb-8">
          你访问的页面可能已被移除或地址有误
        </p>
        <Link to="/" className="btn-primary text-sm">
          返回工作台
        </Link>
      </div>
    </div>
  );
}
