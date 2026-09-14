interface CostConfirmModalProps {
  costEstimate: {
    cost: number;
    tokens: number;
    selected_model_name?: string;
    auto_downgraded?: boolean;
    routing_reason?: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CostConfirmModal({ costEstimate, onConfirm, onCancel }: CostConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="card w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-parchment mb-4">费用预估</h3>
        <div className="space-y-3 mb-6">
          {costEstimate.selected_model_name && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-parchment-dim/60">使用模型</span>
              <span className="text-parchment font-medium">{costEstimate.selected_model_name}</span>
            </div>
          )}
          {costEstimate.auto_downgraded && (
            <div className="text-[11px] text-amber-300/80 bg-amber-500/10 px-2 py-1 rounded">
              已自动降级至低价模型以控制成本
            </div>
          )}
          {costEstimate.routing_reason && (
            <div className="text-[11px] text-parchment-dim/50">{costEstimate.routing_reason}</div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-parchment-dim/60">预估 Tokens</span>
            <span className="text-parchment font-mono">{costEstimate.tokens.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-parchment-dim/60">预估费用</span>
            <span className="text-ink font-display font-bold text-lg">${costEstimate.cost.toFixed(4)}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onConfirm} className="btn-primary flex-1">确认生成</button>
          <button onClick={onCancel} className="btn-secondary">取消</button>
        </div>
      </div>
    </div>
  );
}
