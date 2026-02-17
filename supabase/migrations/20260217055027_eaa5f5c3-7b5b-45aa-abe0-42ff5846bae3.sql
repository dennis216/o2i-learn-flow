-- Update department names and roles
UPDATE team_members SET department = 'Publicity & Marketing', role = 'Co-founder & Team Leader' WHERE id = '6426adda-d520-452a-b28f-8d3913ae7e6c';
UPDATE team_members SET department = 'Publicity & Marketing' WHERE id IN ('119214cf-0480-4507-9ea7-16f8f9fba7aa', 'f1e0c64f-e64c-4d05-9fe7-31c5e29ad0e8');
UPDATE team_members SET role = 'Co-founder & Team Leader' WHERE id IN ('03a070c1-8fdd-4575-a007-c09ec9f86ed3', 'ea06255f-03ab-43c2-bddc-7db7a13fd2d8');
UPDATE team_members SET department = 'Curriculum Content & Media Production' WHERE department = 'Curriculum Content & Production';