const homeView = document.getElementById('home-view');
const projectsView = document.getElementById('projects-view');
const toProjects = document.getElementById('btn-to-projects');
const toHome = document.getElementById('btn-to-home');

toProjects.addEventListener('click', () => {
   homeView.style.display = 'none';
   projectsView.style.display = 'block';

   projectsView.classList.add('animate-in');
   homeView.classList.remove('animate-in');

   window.scrollTo(0, 0);
});

toHome.addEventListener('click', () => {
   projectsView.style.display = 'none';
   homeView.style.display = 'block';

   homeView.classList.add('animate-in');
   projectsView.classList.remove('animate-in');

   window.scrollTo(0, 0);
});