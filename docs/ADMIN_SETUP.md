# O2I admin accounts

The site uses three access levels:

- `student`: normal learner access.
- `admin`: content management for courses, videos, practice problems, subjects, team members, and playground links.
- `super_admin`: the single Top Admin account. It has all content permissions plus account invitations, role management, and login-activity visibility.

Admin permissions live in Supabase Row Level Security. The browser UI is not the security boundary, and no administrator email or password is stored in the source code.

## Bootstrap the first owner

1. Create the owner's account through the normal Sign Up page and confirm the email.
2. In the Supabase SQL editor, replace `owner@example.com` below with the owner's exact email and run this once:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM auth.users
WHERE lower(email) = lower('owner@example.com')
ON CONFLICT (user_id, role) DO NOTHING;
```

The unique database constraint permits only one `super_admin`. The owner can then sign out and sign back in. The navigation will show **Admin**, and the dashboard will include the **Users** tab.

## Add another content admin

1. Sign in as the owner and open **Admin → Users**.
2. Enter the teammate's name and email, then choose Student, Instructor, or Content Admin.
3. Send the invitation. The teammate completes setup from the email and uses the normal website login page.

The Users tab also shows when each account joined and the most recent sign-in recorded by the website. It intentionally does not collect IP addresses or browser fingerprints.

Content admins can add, edit, and delete site content. They cannot grant roles, edit the site UI, change application code, or change database policies from the website.
