I am building an app for grading written questions. and providing detailed feedback.

# Features:

1. User account and authentication with forgot password and email verification (Fully supabase)
2. Plans, 
  plan1: 300 question tests per month, 499tk
  plan2: 300 questions test per momth + weekly exams, 699tk
  plan3: only weekly exams, 299tk per month

  when upgradin the price should be the increase in price like upgrade from 1 to 2 will require 200*(left days/300) more just. not the whole again. but yes the whole if the first one finishes before ordering.
  downgrade is not allowed. users can upgrade anytime.
  in sidenav user will be shown how mmuch do they have left with color transition green-> yellow -> orange -> red and when orange a button to buy extra slot with 5tk per test.

  Whole payment will be done in BKash ans use the agents/.skill/bkash-pra in building that.

3. Follow the design guidelines from the images in md_files/design-files/
4. For the single test scenario, when they click start clock starts. users will first upload their imsge of writting. For 15 marks questions 2 image allowd. other than that only one image and also a reminder that in real IBA exam this is the amount of space you will get. After that that image will get OCRed by GLM-OCR model of z.ai and they will be shown the text, they can edit it again by typing if anything goes wrong. after that they can also resubmit another image if they dont like it. first resubmit is instant, next ones are 60s intervaled. Then if they think its all correct they will click Submit Answer and it will be submitted. they will be taken to a feedback page with their marks and relevant feebacks. Also, show them their response and highlight within their text. 

Grading will be done with openai API.

The response will be saved in their history.
5. The history will show relevant graphs and charts showing their progress and common mistakes, stregths as summary too.
6. There will be an admin panel to organize weekly exams and analyse submissions. Exam scripts will not be auto graded by AI. they will be saved in DB. In admin panel we choose by individual or bulk click which will be done by AI and which we will do ourselfs. But this message od who did this wont be visible to students. 
6. Exams will be taken weekly. The results will be published when admin panel decides. 
ADMIN_1_EMAIL=
ADMIN_1_PASS=
ADMIN_2_EMAIL=
ADMIN_2_PASS=
These are the credentials of admin in .env.
There will be a detailed leaderboard of the weekly exams. This will also remain in history

7. They will be links to our facebook page and group in bottom of sidenav.

FB_PAGE_LINK=
FB_GROUP_LINK=

8. 