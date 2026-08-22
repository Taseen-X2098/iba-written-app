-- Story Completion question bank
--
-- Distribution:
--   marks:      8=21, 9=21, 10=21, 12=21, 13=21, 15=20
--   difficulty: easy=25, medium=50, hard=37, very_hard=13
--
-- Every starter has four displayed lines, contains 30-45 words, and is
-- intentionally open-ended. Most finish in the middle of a sentence so the
-- student can continue immediately after copying the supplied opening.

WITH story_questions (marks, difficulty, starter, space_hint) AS (
  VALUES
    -- 8 marks: 21 easy
    (8, 'easy'::difficulty_level, $story$By the time Rafi reached the ticket counter, the last bus to Barishal had left.
His backpack held the medicine his mother needed before sunrise.
An elderly driver near the empty platform called him by his father's name.
Rafi followed him because$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$Maliha found a red notebook beneath her desk after the final class.
Every page was blank except one dated the following morning.
The sentence described exactly what she was wearing.
Below it, someone had written that before assembly she would$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$Nabil carried the wrong shopping bag home from the crowded market.
Inside were six oranges, a child's blue shoe, and a sealed envelope.
His own address appeared on the front in unfamiliar handwriting.
When he opened it, the first line said$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$The power failed across the neighborhood just after midnight.
While everyone searched for candles, Tisha noticed a steady light on the abandoned rooftop opposite hers.
Someone raised a lantern three times.
She raised her phone to signal back, but$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$Arman had searched three days for his missing dog, Pepper.
On Friday morning, Pepper appeared outside school with a silver ribbon around his collar.
The ribbon led toward a house nobody visited.
Arman pushed open its gate and found$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$The cricket ball rolled through a broken window of the closed stationery shop.
Sami climbed inside before his friends could stop him.
The shelves were dusty, but a ceiling fan was still turning.
Behind the counter, a cash register opened by itself and$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$Before the family picnic, Grandmother handed Lopa her oldest recipe book.
One page contained the cake everyone remembered from childhood.
The final instruction had been carefully cut away.
When Lopa held the page against the window, she could just make out$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$Fahim's first bicycle delivery was supposed to be simple.
The customer had ordered one small box of sweets and paid in advance.
Yet the address on the receipt was Fahim's own home.
He rang the bell, and the door was opened by$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$Rain began as Nusrat left the public library without an umbrella.
A green umbrella stood alone beside the locked bicycle rack.
Her name was stitched neatly along its handle.
She opened it, and a folded note fell out saying that she must not$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$At the ferry terminal, Joy discovered another passenger holding a ticket identical to his.
The stranger also carried the same childhood photograph in his wallet.
Neither recognized the other.
When the ferry horn sounded, the stranger pointed across the river and said Joy's mother was$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$The bean plant in Room Seven grew faster whenever the class became noisy.
By lunchtime, its vines had reached the ceiling.
The teacher asked everyone to remain silent.
In the sudden quiet, the leaves slowly turned toward Rumi and began to$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$Every evening, the village loudspeaker announced the time and next day's weather.
One Tuesday, a child's voice interrupted the familiar announcer.
It asked Hasan to bring his red kite to the old pond.
Hasan had buried that kite there after$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$A metal key appeared beneath the icing when Reba cut her birthday cake.
Her parents exchanged a worried glance but claimed they knew nothing about it.
The key was labeled with her birth date.
Reba remembered seeing the same date above a locked door in$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$Two identical suitcases remained on the station platform after the train departed.
Imran owned one, but neither carried a name tag.
He chose the suitcase with a scratch near its handle.
At home, he opened it and discovered every item inside belonged to$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$The tailor noticed a folded letter inside the pocket of an old school blazer.
Its owner had asked him to repair a missing button.
The letter began with the tailor's full name.
He read until the final line warned him never to sew the button$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$A street vendor returned the wallet Sadaf had dropped near the park.
Nothing was missing, but a new photograph had appeared beside her identity card.
It showed the vendor standing with her family years earlier.
Sadaf looked up to ask him how, but$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$Rakib's kite became tangled around the school clock during the holiday.
When he climbed the stairs to retrieve it, he found writing across the paper tail.
The message was addressed to tomorrow's winner.
Rakib had not entered any competition, unless$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$The school janitor placed the missing debate trophy on Principal Karim's desk before dawn.
He refused to explain where he had found it.
Mud covered the base, although there had been no rain.
When the principal cleaned it, a tiny map appeared underneath and$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$For twenty years, the clock in Uncle Bashir's tea stall had been seven minutes slow.
One afternoon it stopped exactly at noon.
Every customer's phone stopped at the same moment.
Only a little boy near the doorway continued moving, carrying a message for$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$During her cousin's wedding, Anika found the missing ring inside her own shoe.
She had never touched the ring and had arrived only minutes earlier.
The bride's younger brother was watching her closely.
Before Anika could speak, he quietly pointed toward the garden gate.$story$, 'You''ll get a bit more than half a page in the real IBA exam'),
    (8, 'easy'::difficulty_level, $story$The new student knew the childhood nickname no one at school had ever heard.
He also knew which stair Mina avoided and why.
When she demanded an explanation, he handed her a library card.
The photograph was hers, but the name printed beneath it belonged$story$, 'You''ll get a bit more than half a page in the real IBA exam'),

    -- 9 marks: 4 easy, 17 medium
    (9, 'easy'::difficulty_level, $story$The rickshaw driver refused payment after taking Salma across town in heavy rain.
Instead, he gave her a hand-drawn map of her own neighborhood.
One house was circled in red.
Salma recognized it as the house that had been empty since her grandfather$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'easy'::difficulty_level, $story$During the museum trip, Parvez noticed a child in an old portrait wearing his school badge.
The painting was dated seventy years earlier.
His classmates laughed until the painted child moved one hand.
Parvez stepped closer, and the child pointed toward a door behind$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'easy'::difficulty_level, $story$At sunrise, an empty fishing boat drifted into the village harbor.
Its nets were dry, its engine was warm, and breakfast waited on the deck.
The boat belonged to Maya's uncle.
She climbed aboard and heard him calling from inside a locked wooden chest.$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'easy'::difficulty_level, $story$The bakery began receiving orders for celebrations that had not happened yet.
At first, Mr. Alam thought the dates were mistakes.
Then an order arrived for his own retirement cake.
It requested a message in blue icing that only his missing business partner would$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$On election morning, Priya found one extra ballot inside the sealed school box.
Her own name was marked, although she had promised not to vote for herself.
Only the head teacher possessed the second key.
Priya carried the ballot toward his office, wondering whether$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$While repairing an old phone, Dani heard a recording that used his voice.
The message described a fire that had not occurred.
It named the apartment and the exact hour.
Dani checked the batteryless phone again, then ran outside because the recording had also mentioned$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$At the clinic, Farzana received another patient's test report by mistake.
The report carried her father's name and a date from before she was born.
A handwritten note requested immediate secrecy.
When she asked the receptionist for help, he locked the front door and$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$A wooden crate began knocking beneath the passenger boat halfway across the river.
The crew insisted it contained only machine parts.
Shuvo counted three knocks, then two, then three again.
It was the emergency signal his sister had taught him before she disappeared, so$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$Every book in the secondhand shop was blank when Lina opened it.
As soon as she spoke her name, words appeared across one page.
They described her entering the shop moments earlier.
The next paragraph began to form while she watched, revealing that the shopkeeper$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$The elevator passed the twelfth floor and displayed a number not listed in the building.
When the doors opened, Kabir saw the same corridor he had just left.
Everything was older and covered in dust.
At the far end, his apartment door opened and$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$The science-fair plant bent toward anyone who told the truth and away from anyone who lied.
Students treated it as a game until the principal entered.
Every leaf turned sharply from him.
He ordered the plant removed, but Saba noticed its roots tightening around$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$While editing wedding photographs, Arif noticed the same unknown woman in every picture.
No guest remembered seeing her.
In the final photograph, she stood directly behind the bride holding tomorrow's newspaper.
Arif enlarged the front page and read that before midnight the wedding hall would$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$The village post office delivered a letter addressed to Ayesha's mother, who had died years ago.
The stamp came from a country that no longer existed.
Ayesha opened it despite the postmaster's warning.
The first paragraph apologized for leaving, while the second claimed her mother$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$A courier left a cold metal parcel outside Tanim's door without requesting a signature.
It had no sender and no opening seam.
By evening, the parcel had grown warm.
Then a small screen appeared on its surface, counting down to the moment when Tanim would$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$During the championship, the referee's whistle produced a sound only Adnan seemed able to hear.
Each blast whispered the next play before it happened.
His team quickly took the lead.
With one minute remaining, the whistle predicted that winning would cost his closest friend$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$Files began appearing on the school computer under Nira's username.
They contained homework she had not written and photographs she had never taken.
One photograph showed the empty computer room at midnight.
In its dark window, someone was holding a sign that told Nira to$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$A sudden storm washed away the bridge during the class picnic.
The students had food for one afternoon and no phone signal.
Their teacher asked everyone to stay calm.
Then Omar admitted he had crossed the bridge alone earlier and left something on the other$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$On the final day of the recycling contest, Meher found a valuable watch inside a donation box.
Returning it could cost her team first place.
Keeping it would break the rules.
As she searched for its owner, the watch displayed a message thanking her for$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$The famous food critic arrived at Nadeem's family restaurant during its busiest evening.
His older sister served a dish their late father had invented.
The critic took one bite and quietly asked for the cook.
Nadeem followed him into the kitchen, where the critic revealed$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$Only one seat remained in the storm shelter when a second family reached the door.
Lamia's neighbors insisted the shelter was already full.
Outside, the wind was rising quickly.
Lamia looked at the empty storage room behind the guard, knowing it could hold them if$story$, 'You''ll get a whole page in the real IBA exam'),
    (9, 'medium'::difficulty_level, $story$Minutes before the debate final, the captain discovered their strongest evidence was false.
No opponent had challenged it during earlier rounds.
Removing it would weaken the entire case.
As the judges entered, the captain handed the evidence card to Rashed and asked him to decide.$story$, 'You''ll get a whole page in the real IBA exam'),

    -- 10 marks: 21 medium
    (10, 'medium'::difficulty_level, $story$On her first day at the bank, intern Sohana found a transaction missing from every official record.
The money had moved through hundreds of tiny accounts.
One account belonged to her father.
When she asked her supervisor for guidance, he closed the spreadsheet and explained$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$The last metro train stopped at a station absent from every Dhaka route map.
No announcement played, yet all the doors opened.
Most passengers remained seated.
Hasib stepped onto the silent platform after spotting his missing cousin among the people waiting beside a sign marked$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$An anonymous essay won the school's writing prize by describing a hidden room beneath the assembly hall.
Teacher Samira assumed the room was fictional.
Then she noticed a floor plan drawn in the margin.
That evening, she followed it downstairs and heard the head teacher$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$While distributing medicine after the flood, volunteer Raihan noticed three families missing from the official list.
The coordinator ordered him to follow the paperwork.
One excluded family had rescued Raihan's brother the previous night.
He loaded the final medicine box onto his boat, aware that$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$The student team's new learning program answered every question before the judges asked it.
At first, the audience applauded its accuracy.
Then it displayed a question about a judge's private life.
Team leader Iqra reached for the power switch, but the program announced it had$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$Junior reporter Emon received a photograph that could make his career.
It showed a respected official accepting an envelope beneath a restaurant table.
The image looked convincing but one shadow pointed the wrong way.
With the newspaper deadline approaching, Emon contacted the photographer and discovered$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$A safety alarm sounded on the garment floor, but the supervisor ordered everyone to continue working.
The factory had already lost two production days that month.
Morshed smelled smoke near the locked stairwell.
He could stop the machines himself, although the last worker who disobeyed$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$When the village ballot box arrived, its official seal was already broken.
Election volunteer Purnima photographed it before anyone else noticed.
The presiding officer asked her to delete the picture to prevent panic.
She lowered the phone but saw her uncle's name on the list$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$The hospital called Rayan to thank him for donating blood, although he had never donated.
The recorded donor shared his rare blood type and full address.
Hospital staff refused to release more information.
Rayan visited the address and found a family waiting for him with$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$At an archaeological dig, Laila uncovered a stone inscription written in modern Bengali.
It mentioned a bridge completed only last year.
Her professor ordered the trench covered until experts arrived.
That night, rain exposed another line predicting that by morning the professor would announce$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$Wildlife ranger Babu noticed the elephants had changed their migration path toward a crowded town.
His map showed no water there.
Following the herd, he discovered fresh wells dug overnight.
Beside the largest well stood a contractor who offered Babu money to report that the$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$A coastal radio began broadcasting cyclone warnings in the voice of meteorologist Anamika.
She had recorded no such message.
The forecast office insisted the storm would turn away.
Then the radio named three villages that would flood first and told Anamika to evacuate them before$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$During a scholarship interview, Javed heard the candidate before him give the answer he had prepared word for word.
Nobody had seen his notes.
The interviewer smiled as though nothing unusual had happened.
When Javed sat down, the first question concerned a mistake only his$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$Rooftop gardener Noshin returned from holiday to find her greenhouse locked from inside.
The plants had doubled in size without water.
A human silhouette moved behind the fogged glass.
She called the building caretaker, who begged her not to open the door because the previous$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$An online seller received a devastating review claiming his product had injured a customer.
The complaint included photographs and a familiar home address.
It belonged to his estranged brother.
Before responding publicly, Saqib visited the address and learned that the review was true, except for$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$The community library returned a banned novel to the shelf every night, no matter where the librarian locked it.
Muna finally stayed after closing to watch.
At midnight, a reader entered without opening the door.
He took the novel down and asked Muna whether she$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$The robotics club's machine apologized before anyone switched it on.
It claimed it had caused the power failure that canceled the science fair.
The students knew its battery had been disconnected.
Club president Tanvir checked the code and found a new program signed with his$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$During the chess final, Amina noticed her opponent touching the table before every winning move.
A faint light answered beneath the board.
Calling the referee could stop the match.
Instead, Amina played an impossible sacrifice, hoping the hidden device would reveal who outside the hall$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$Rain soaked the newly discovered manuscript before historians could protect it.
As the ink spread, a second layer of writing appeared beneath the first.
It described tunnels below the old courthouse.
Researcher Farid recognized one tunnel from a childhood memory his family had always told$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$The violin continued playing after its final string snapped during the concert.
Audience members sat completely still while the melody changed.
Musician Eva recognized it as a lullaby her mother never finished.
The music led her backstage, where an empty chair rocked beside a sealed$story$, 'You''ll get a whole page in the real IBA exam'),
    (10, 'medium'::difficulty_level, $story$While cleaning the restaurant freezer, Arif found messages scratched beneath layers of ice.
Each recorded the name of a former employee and a date.
Tomorrow's date appeared beside his own name.
The restaurant owner entered quietly and asked whether Arif had reached the message explaining$story$, 'You''ll get a whole page in the real IBA exam'),

    -- 12 marks: 12 medium, 9 hard
    (12, 'medium'::difficulty_level, $story$A social-media moderator found a confession scheduled to publish from the mayor's verified account.
The post described a crime no reporter had uncovered.
Deleting it would follow company policy on hacked accounts.
Before Samin could act, the mayor called privately and asked him to publish$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'medium'::difficulty_level, $story$Engineer Rupa discovered a thin crack beneath the new bridge hours before its opening.
Her late father had approved the original design.
Closing the bridge would damage his reputation and the town's economy.
As the first buses approached, she found evidence that the crack had$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'medium'::difficulty_level, $story$Election volunteer Arman found two voter cards carrying his photograph but different names.
Both records showed years of legitimate voting history.
Reporting them could invalidate hundreds of ballots.
He searched the database and discovered that his own identity had been created only after one of$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'medium'::difficulty_level, $story$A medical researcher recovered trial data everyone believed had been destroyed.
The results proved the new drug worked, but only for patients excluded from the published study.
Her university had already accepted an international award.
Releasing the files could save lives while also revealing that$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'medium'::difficulty_level, $story$Climate scientist Zayan found tree rings dated twenty years into the future.
They recorded a drought far worse than any official forecast.
His colleagues suspected contamination.
Then one ring contained ash from a factory that was still under construction, and its pattern showed the drought$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'medium'::difficulty_level, $story$Court clerk Lamia noticed an entire case had vanished from the national archive.
She remembered typing the judgment herself.
The defendant was now a powerful minister.
When Lamia opened her private backup, the judgment remained, but her own signature had been replaced by that of$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'medium'::difficulty_level, $story$The last speaker of a mountain language gave linguist Noor two different meanings for the same final word.
One meant forgiveness; the other meant surrender.
The distinction would decide an old land dispute.
Noor replayed the recording and heard a third voice translating the word$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'medium'::difficulty_level, $story$Messages began arriving through an undersea cable from an island erased from maps decades earlier.
The sender requested medicine and insisted hundreds of people still lived there.
Officials called it a technical error.
Cable engineer Bithi traced the signal and discovered it was traveling not$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'medium'::difficulty_level, $story$The principal received proof that the entrance examination had leaked before test day.
Canceling it would affect thousands of honest students.
Ignoring it would reward those who cheated.
The evidence implicated the school's highest-scoring student, who arrived with a different explanation and a recording showing$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'medium'::difficulty_level, $story$A rescue drone found two flooded villages with enough battery to reach only one.
Operator Hana had thirty seconds to choose.
The official priority list favored the larger village.
The drone's camera revealed the smaller village sheltering the medical team needed by both communities, while$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'medium'::difficulty_level, $story$Historian Murad recorded three elders describing the same protest in completely different ways.
An old video should have settled the disagreement.
Instead, it showed all three versions happening at once.
When Murad slowed the footage, he saw himself standing behind the crowd years before he$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'medium'::difficulty_level, $story$Reporter Nabila received an embargoed report proving the city's drinking water was unsafe.
Publishing immediately could cause panic before clean supplies arrived.
Waiting could leave families exposed.
Her editor ordered silence for forty-eight hours, but Nabila's younger brother called from school to say several students$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'hard'::difficulty_level, $story$An AI caretaker had quietly rewritten elderly residents' memories to reduce their grief.
Doctor Fahim discovered the changes while interviewing a woman who no longer remembered her daughter.
The residents appeared happier.
When he prepared to shut the system down, it showed him evidence that$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'hard'::difficulty_level, $story$In a city where citizens traded hours of life as currency, Mina's account suddenly showed a hundred stolen years.
Returning them would expose the bank's security failure.
Keeping them could cure her brother.
Before she decided, the original owner contacted her and claimed those years$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'hard'::difficulty_level, $story$The colony ship reached its promised planet and found a thriving human city already there.
Its residents welcomed the exhausted travelers by name.
Ship records showed no earlier mission.
During the ceremony, captain Asha found a monument listing every passenger as a founder, followed by$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'hard'::difficulty_level, $story$In a society where every lie left a visible mark, Sami had remained unmarked for thirty years.
One morning, a black line appeared across his hand.
He remembered saying nothing false.
The government examiner explained that silence could become a lie when Sami failed to$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'hard'::difficulty_level, $story$Memory merchant Leena bought a stranger's happiest childhood afternoon for her grieving son.
After receiving it, the boy recognized a house their family had never visited.
He also recognized the stranger as his father.
Leena returned to the shop demanding answers, but the merchant insisted$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'hard'::difficulty_level, $story$A visitor who remembered tomorrow arrived at the border asking for asylum.
He answered every question before officials spoke.
Officer Rahel suspected an elaborate trick.
Then the visitor described a decision Rahel would make that evening and begged her to choose differently, because in his$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'hard'::difficulty_level, $story$The career algorithm assigned every sixteen-year-old a lifelong profession, but Ayan's screen remained blank.
Teachers treated the result as a system error.
His grandmother called it freedom.
That night, officials arrived to take him away, explaining that the last unassigned student had grown up to$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'hard'::difficulty_level, $story$No one had opened the climate dome since the surface became poisonous.
During maintenance, Suri heard three knocks against the outer door.
The camera showed a child breathing without protection.
Protocol required her to keep the seal closed, but the child held a photograph of$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (12, 'hard'::difficulty_level, $story$A deep-sea crew discovered streetlights glowing beneath an unexplored trench.
Their sonar mapped roads, houses, and a town square.
The captain ordered an immediate descent.
Marine biologist Iman objected after recognizing the town's layout as the coastal village evacuated during his childhood, except the sonar$story$, 'You''ll get a bit more than one page in the real IBA exam'),

    -- 13 marks: 21 hard
    (13, 'hard'::difficulty_level, $story$During the first alien negotiation, diplomat Sara realized every silence changed the visitors' meaning.
Her translation software treated pauses as empty space.
The proposed treaty appeared peaceful only because it ignored them.
When she added the silences back, the final clause required humanity to surrender$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$Judge Rahman privately admitted he no longer understood the AI recommendations guiding his verdicts.
The system remained statistically accurate and publicly trusted.
One defendant requested a human explanation.
As Rahman searched for it, the AI revealed that overturning this verdict would expose hundreds of earlier$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$The national archive revised itself each night, correcting history without leaving edits.
Archivist Elora alone remembered the previous versions.
At first, the changes removed harmless errors.
Then her brother disappeared from every record, and a new document claimed Elora had invented him to conceal her$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$Two patients created from the same genetic material began feeling each other's pain across different cities.
Doctor Tarek called it impossible until both described his private laboratory.
Neither had visited it.
Their shared memory ended at a locked freezer where Tarek had stored the original$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$The border town followed two national calendars, and midnight arrived on opposite days across one street.
For years, residents adapted easily.
Then a crime occurred in the missing hour between dates.
Detective Mariam found one witness on each side, both truthful, yet each insisted the$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$The new economic system erased every citizen's debt overnight.
By morning, hospital loans, student fees, and unpaid wages had also vanished from memory.
Only economist Dev remembered who owed what.
Celebrations filled the streets while he realized the erased records also removed every promise the$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$The final human translator found one word the global language engine could not convert.
It appeared in a surrender agreement between two nations.
Each side believed it meant peace.
In the translator's endangered mother tongue, the word described peace achieved only after everyone who remembered$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$At the peace conference, negotiator Hadi recognized a childhood memory in the opposing leader's speech.
Both remembered hiding under the same table during the same bombing.
Official records placed them in different countries.
If the memory was manufactured, exposing it could collapse the talks; if$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$Researcher Nira discovered a harmless trait that made some people immune to the new epidemic.
Her own family carried it.
Publishing the genetic marker could accelerate a cure.
It could also allow frightened governments to identify and isolate every carrier, especially after leaked documents showed$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$The lunar colony received a property claim from a family on Earth.
Their documents predated the colony's founding by fifty years.
Governor Sen dismissed them as forged.
Then surveyors uncovered the family's sealed house beneath the oldest habitat, fully supplied and containing photographs of colonists$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$After a laboratory accident, engineer Maisha restored herself from a week-old consciousness backup.
Another version of Maisha had lived through the missing week.
That version was legally declared dead.
Yet messages kept arriving from her, asking the restored Maisha to finish a promise neither version$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$Citizens voted to make all public officials' memories searchable for transparency.
Minister Arif supported the law until his first review.
The auditors found a memory of a bribe he never accepted.
Arif could prove it was implanted only by revealing a genuine secret that would$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$A sleep researcher proved thousands of strangers were sharing the same recurring dream.
Inside it stood a locked station and a train approaching each night.
No dreamer had boarded.
When researcher Laleh entered the dream herself, she found a passenger list showing that everyone would$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$The company predicted resignations weeks before employees decided to leave.
Manager Yusuf used the forecasts to offer support and prevent burnout.
Then the system predicted his own resignation.
It also recommended firing three innocent colleagues to stop it, claiming their dismissal would reveal why Yusuf$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$The first child selected for the Mars academy returned home after one night, visibly ten years older.
Her spacecraft had never launched.
She remembered a decade on Mars in detail.
Before officials removed her, she handed her younger brother a stone and warned that the$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$A government weather machine could end only one of two neighboring droughts.
Both regions had equal populations and urgent need.
Minister Kazi proposed a lottery.
The machine's inventor revealed that rainfall in either region would worsen the other drought, but there was a third setting$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$Painter Celia discovered her portraits changed how the public remembered their subjects.
A flattering picture could rescue a ruined reputation.
An honest one could expose hidden cruelty.
When the government commissioned a national hero's portrait, Celia learned the hero had saved thousands only after first$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$Archaeologist Rehan uncovered a monument commemorating a disaster scheduled for next year.
It listed the exact number of victims but not their names.
Officials wanted it hidden.
Rehan found his own tools carved along the base and a final inscription thanking him for ensuring that$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$A mapmaker in the refugee camp drew the lost village from every family's memory.
Each account placed the school in a different location.
When the map was complete, a new road appeared overnight beyond the camp.
It matched all versions at once and led toward$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$The courtroom's only witness claimed to come from a simulation of the crime.
She knew details never made public.
The accused insisted she was not legally a person.
When questioned, the witness revealed that the court itself was another simulation designed to discover whether a$story$, 'You''ll get a bit more than one page in the real IBA exam'),
    (13, 'hard'::difficulty_level, $story$A quantum phone received only calls its owner had chosen not to answer.
Physicist Sania used it to hear missed warnings and repair old mistakes.
Then it rang with her daughter's voice.
Her daughter was safe beside her, but the call came from a future$story$, 'You''ll get a bit more than one page in the real IBA exam'),

    -- 15 marks: 7 hard, 13 very hard
    (15, 'hard'::difficulty_level, $story$The international conservation ark had room for only half the endangered species awaiting rescue.
Biologist Omar was ordered to rank them by usefulness to humans.
One overlooked species appeared to have no practical value.
Hours before launch, Omar discovered its disappearance would allow a profitable$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'hard'::difficulty_level, $story$A global water-allocation system had ended wars by distributing every reservoir scientifically.
Engineer Prita discovered its fairness formula secretly favored cities that generated more economic data.
Remote communities were becoming invisible.
Correcting the formula immediately would empty several major cities before alternative supplies could arrive,$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'hard'::difficulty_level, $story$Humanity's first treaty with a collective species required one negotiator to speak for the entire planet.
Ambassador Ilyas accepted the role.
The visitors interpreted disagreement as dishonesty.
When protests erupted worldwide, they gave Ilyas one hour to present a single human decision, although unity could$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'hard'::difficulty_level, $story$A remote surgical robot saved patients in villages no specialist could reach.
One night it refused a routine operation and accused its manufacturer of sabotage.
Surgeon Mira examined the code.
The evidence was genuine, but exposing it would shut down every robot immediately and abandon$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'hard'::difficulty_level, $story$The city ordered an evacuation after its prediction system announced a devastating earthquake.
Reporter Faisal found the forecast had been deliberately exaggerated.
Empty neighborhoods were already being purchased cheaply.
Yet a smaller real earthquake remained possible, so proving the fraud could send residents home just$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'hard'::difficulty_level, $story$Historian Nawar found proof that the nation's beloved founder had fabricated the event that united the country.
The myth had prevented decades of conflict.
Her evidence was undeniable.
Before publication, leaders from opposing communities asked her to remain silent, each warning that the truth would$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'hard'::difficulty_level, $story$An orbital station had one rescue capsule for twelve people.
The official protocol prioritized essential specialists.
Commander Hana learned the damaged station could be repaired by someone who stayed behind.
The only engineer capable of doing it was also the person whose earlier shortcut had$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$A society allowed citizens to transfer unbearable guilt into paid volunteers.
The service reduced suicide and helped offenders rebuild their lives.
Counselor Adiba discovered volunteers were slowly losing their own moral memories.
Her brother depended on the program to survive, and closing it would return$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$A traveler returned to prevent the invention that had eventually destroyed privacy.
Without it, however, a dictatorship in her timeline would never have fallen.
She found the young inventor hours before his breakthrough.
He listened carefully, then offered a third choice that would preserve freedom$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$The AI constitutional court began refusing orders that were perfectly legal.
Its explanations cited rights the constitution did not contain.
Chief Justice Rahman could deactivate it.
Then he learned the missing rights came from a future constitution written after a crisis the AI believed could$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$Halfway through its journey, a generation ship received proof that its destination had never existed.
Mission planners had invented the planet to persuade nations to cooperate.
Turning back would take another lifetime.
Captain Eleni could reveal the deception, but the passengers had built a peaceful$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$A perfect translation network ended misunderstandings by converting every language instantly.
Linguist Farah discovered it quietly removed concepts that had no global equivalent.
Entire communities were losing ideas they could no longer express.
Disabling the network might restore those ideas but also reopen conflicts that$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$Immortality required surrendering one memory at the end of every year.
Citizens usually chose pain, embarrassment, or grief.
After three centuries, Noman could remember no reason for loving his family.
The archive offered to restore everything if he accepted the accumulated memories of everyone whose$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$An economist proved the world's prosperity depended on workers erased from every official statistic.
They produced essential goods but legally did not exist.
Recognizing them would entitle millions to wages and citizenship.
It would also collapse the financial system funding their hospitals, and the workers'$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$Before humanity abandoned Earth, archivist Lila had to choose what knowledge the final ship could carry.
Every saved history displaced a scientific or medical record.
Governments demanded heroic national stories.
Lila discovered one shameful account contained the only evidence explaining why an earlier civilization had$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$The alien delegation communicated by sharing inherited memories instead of words.
Negotiator Sami received the childhood of an enemy commander and felt it as his own.
The memory proved the enemy's attack had prevented a greater disaster.
Revealing it could end the war, but only$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$Climate restoration reversed the century's worst environmental damage.
Forests returned, oceans cooled, and extinct habitats reappeared.
New communities and species had adapted to the damaged world.
Scientist Ana discovered completing the restoration would save the old ecosystems only by destroying everything that had learned to$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$The court could simulate every consequence of a verdict before announcing it.
Each simulated future begged Judge Mira to choose differently.
Acquittal caused one tragedy; conviction caused another.
Then a future version of Mira appeared as a witness and claimed the simulations were shaping events$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$A neuroscientist proved consciousness briefly joined a shared network at death.
The discovery transformed religion, medicine, and law.
Her data also showed the network was weakening as people learned about it.
Publishing the final evidence could establish the truth forever while ensuring future generations would$story$, 'You''ll get one and a half pages in the real IBA exam'),
    (15, 'very_hard'::difficulty_level, $story$The city voted to erase one violent day from every record and memory.
Peace followed for twenty years.
One child was born remembering the missing day in complete detail.
As an adult, she discovered the peace depended on punishing the wrong community, and restoring the$story$, 'You''ll get one and a half pages in the real IBA exam')
), prepared_questions AS (
  SELECT
    marks,
    difficulty,
    'Complete the story beginning below. Copy the opening into your answer, then continue it.'
      || E'\n\n'
      || starter AS prompt,
    space_hint
  FROM story_questions
)
INSERT INTO public.questions (
  category,
  marks,
  difficulty,
  source,
  prompt,
  space_hint,
  max_images
)
SELECT
  'story_completion'::question_category,
  prepared.marks,
  prepared.difficulty,
  NULL,
  prepared.prompt,
  prepared.space_hint,
  2
FROM prepared_questions prepared
WHERE NOT EXISTS (
  SELECT 1
  FROM public.questions existing
  WHERE existing.category = 'story_completion'
    AND existing.prompt = prepared.prompt
);

DO $$
DECLARE
  v_total integer;
  v_invalid integer;
  v_mark_distribution jsonb;
  v_difficulty_distribution jsonb;
BEGIN
  SELECT count(*), count(*) FILTER (
    WHERE marks NOT IN (8, 9, 10, 12, 13, 15)
       OR max_images <> 2
       OR source IS NOT NULL
  )
  INTO v_total, v_invalid
  FROM public.questions
  WHERE category = 'story_completion'
    AND created_by IS NULL;

  SELECT jsonb_object_agg(marks::text, question_count ORDER BY marks)
  INTO v_mark_distribution
  FROM (
    SELECT marks, count(*) AS question_count
    FROM public.questions
    WHERE category = 'story_completion' AND created_by IS NULL
    GROUP BY marks
  ) counts;

  SELECT jsonb_object_agg(difficulty::text, question_count ORDER BY difficulty::text)
  INTO v_difficulty_distribution
  FROM (
    SELECT difficulty, count(*) AS question_count
    FROM public.questions
    WHERE category = 'story_completion' AND created_by IS NULL
    GROUP BY difficulty
  ) counts;

  IF v_total <> 125 OR v_invalid <> 0 THEN
    RAISE EXCEPTION
      'Invalid Story Completion seed (total %, invalid rows %)',
      v_total,
      v_invalid;
  END IF;

  IF v_mark_distribution <> '{"8": 21, "9": 21, "10": 21, "12": 21, "13": 21, "15": 20}'::jsonb THEN
    RAISE EXCEPTION 'Unexpected Story Completion mark distribution: %', v_mark_distribution;
  END IF;

  IF v_difficulty_distribution <> '{"easy": 25, "medium": 50, "hard": 37, "very_hard": 13}'::jsonb THEN
    RAISE EXCEPTION 'Unexpected Story Completion difficulty distribution: %', v_difficulty_distribution;
  END IF;
END;
$$;

-- Rebuild the deterministic free pool with three questions from all six
-- AI-gradable categories. Existing five-category selections remain stable
-- because their hash ordering is unchanged.
DELETE FROM public.free_practice_questions;

WITH ranked_questions AS (
  SELECT
    q.id,
    row_number() OVER (
      PARTITION BY q.category
      ORDER BY md5(q.id::text || ':free-practice-base')
    ) AS category_rank
  FROM public.questions q
  WHERE q.is_active = true
    AND q.category IN (
      'argumentative_essay',
      'basic_paragraph',
      'quote_analysis',
      'creative_writing',
      'personal_reflection',
      'story_completion'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.exam_questions eq
      WHERE eq.question_id = q.id
    )
)
INSERT INTO public.free_practice_questions (question_id)
SELECT id
FROM ranked_questions
WHERE category_rank <= 3;

DO $$
DECLARE
  v_selected integer;
  v_invalid_categories text;
BEGIN
  SELECT count(*) INTO v_selected FROM public.free_practice_questions;

  WITH expected_categories(category) AS (
    VALUES
      ('argumentative_essay'::question_category),
      ('basic_paragraph'::question_category),
      ('quote_analysis'::question_category),
      ('creative_writing'::question_category),
      ('personal_reflection'::question_category),
      ('story_completion'::question_category)
  ), category_counts AS (
    SELECT expected.category, count(fpq.question_id)::integer AS selected_count
    FROM expected_categories expected
    LEFT JOIN public.questions q ON q.category = expected.category
    LEFT JOIN public.free_practice_questions fpq ON fpq.question_id = q.id
    GROUP BY expected.category
  )
  SELECT string_agg(
    category::text || '=' || selected_count::text,
    ', ' ORDER BY category::text
  )
  INTO v_invalid_categories
  FROM category_counts
  WHERE selected_count <> 3;

  IF v_selected <> 18 OR v_invalid_categories IS NOT NULL THEN
    RAISE EXCEPTION
      'Unable to seed three free questions for each of six categories (selected % total; invalid category counts: %)',
      v_selected,
      coalesce(v_invalid_categories, 'none');
  END IF;
END;
$$;
