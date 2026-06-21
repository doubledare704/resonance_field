import { navigateTo, requestExpandedMode } from '@devvit/web/client';

const docsLink = document.getElementById('docs-link') as HTMLDivElement;
const playtestLink = document.getElementById('playtest-link') as HTMLDivElement;
const discordLink = document.getElementById('discord-link') as HTMLDivElement;
const playButton = document.getElementById('play-button') as HTMLButtonElement;
const titleElement = document.getElementById('title') as HTMLHeadingElement;

playButton.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

docsLink.addEventListener('click', () => {
  navigateTo('https://developers.reddit.com/docs');
});

playtestLink.addEventListener('click', () => {
  navigateTo('https://www.reddit.com/r/Devvit');
});

discordLink.addEventListener('click', () => {
  navigateTo('https://discord.com/invite/R7yu2wh9Qz');
});

function init() {
  titleElement.textContent = `Resonance Field`;
}

init();
