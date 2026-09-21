import { AnchorApp } from './AnchorApp';
import { mount } from './bootstrap';

document.documentElement.dataset.loopWindow = 'anchor';
void mount(() => <AnchorApp />);
