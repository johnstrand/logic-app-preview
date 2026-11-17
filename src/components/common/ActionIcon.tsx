import {
  Box,
  Clock,
  Cloud,
  Code2,
  GitBranch,
  GitFork,
  Globe,
  Layers,
  OctagonX,
  Plug,
  Repeat,
  RotateCw,
  Send,
  Terminal,
  Variable,
  Webhook,
  Workflow,
} from 'lucide-react';
import type { NodeIconName } from '../../types/workflow';

interface ActionIconProps {
  name: NodeIconName;
  size?: number;
  className?: string;
}

export function ActionIcon({ name, size = 16, className }: ActionIconProps) {
  switch (name) {
    case 'webhook':
      return <Webhook size={size} className={className} />;
    case 'clock':
      return <Clock size={size} className={className} />;
    case 'globe':
      return <Globe size={size} className={className} />;
    case 'send':
      return <Send size={size} className={className} />;
    case 'plug':
      return <Plug size={size} className={className} />;
    case 'cloud':
      return <Cloud size={size} className={className} />;
    case 'code':
      return <Code2 size={size} className={className} />;
    case 'variable':
      return <Variable size={size} className={className} />;
    case 'workflow':
      return <Workflow size={size} className={className} />;
    case 'terminal':
      return <Terminal size={size} className={className} />;
    case 'terminate':
      return <OctagonX size={size} className={className} />;
    case 'layers':
      return <Layers size={size} className={className} />;
    case 'split':
      return <GitFork size={size} className={className} />;
    case 'route':
      return <GitBranch size={size} className={className} />;
    case 'repeat':
      return <Repeat size={size} className={className} />;
    case 'rotate':
      return <RotateCw size={size} className={className} />;
    case 'box':
    default:
      return <Box size={size} className={className} />;
  }
}
