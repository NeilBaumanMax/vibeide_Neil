import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.less';
import './styles/apple.less';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
