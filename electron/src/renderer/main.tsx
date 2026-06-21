import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import 'nes.css/css/nes.min.css';
import './styles/global.less';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
