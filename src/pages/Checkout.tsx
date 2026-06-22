import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CreditCard, Truck, User, Check, Search, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCart, calculateItemTotal, getDescriptionMultiplier } from '@/contexts/CartContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import Header from '@/components/Header';
import ProductImage from '@/components/ProductImage';
import logoImage from '@/assets/babyland-logo.jpg';

// Old customers data - format: name | shopName | address | phone
const oldCustomersData = [
  { name: 'رحاب', shopName: 'بيبي كيوت', address: 'شبين الكوم المنوفيه', phone: '1110912091' },
  { name: 'Yassin', shopName: 'Bassem', address: 'Giza', phone: '1033110143' },
  { name: 'محمد سامي', shopName: 'ابوريا', address: 'منوف المنوفيه', phone: '1066826936' },
  { name: 'ايه وحيد', shopName: 'بافتا بيبي ستور', address: 'بني سويف ش الاباصيري', phone: '1100664891' },
  { name: 'مصطفى', shopName: 'مستر بيبى', address: 'الواسطى بنى سويف', phone: '1000767629' },
  { name: 'نادر عادل شوقى', shopName: 'بونيتا', address: 'السويس', phone: '1288077641' },
  { name: 'مكتب', shopName: 'هاله مصبح', address: 'طهطا بسوهاج', phone: '1032887364' },
  { name: 'حازم علي', shopName: 'Boss baby', address: 'بني سويف', phone: '1277767981' },
  { name: 'ابوعمار', shopName: 'ابوعمار', address: 'القاهره النعام عين شمس', phone: '1143695161' },
  { name: 'حسن سامى', shopName: 'سنتر منار', address: 'كفر الشيخ الحامول', phone: '1067524544' },
  { name: 'محمد بدر', shopName: 'بامبينو اسيوط', address: 'أسيوط شارع الجمهوريه', phone: '1044315571' },
  { name: 'الاء احمد', shopName: 'ليندا ستور', address: 'طما سوهاج', phone: '1091490943' },
  { name: 'محل', shopName: 'ببرونه', address: 'اسكندريه فيلمينج', phone: '1144458758' },
  { name: 'مريم محمد الشريف', shopName: 'روزي شوبينج', address: 'ارض ادمون اخر شارع جامع عطا', phone: '1002233097' },
  { name: 'اميره مهدى', shopName: 'baby store', address: 'دمنهور البحيره', phone: '1112178886' },
  { name: 'يارا الجندى', shopName: 'memo', address: 'دمنهور البحيره', phone: '1552459900' },
  { name: 'بيلا بورسعيد', shopName: 'بيلا بيبي', address: 'بورسعيد', phone: '201004263363' },
  { name: 'رضا الدبور', shopName: 'رضا', address: 'شبين الكوم', phone: '201006069835' },
  { name: 'محمد عثمان', shopName: 'بيبي شوب', address: 'شبين الكوم', phone: '1006999091' },
  { name: 'زين', shopName: 'مكتب زين', address: 'السادات', phone: '1098242873' },
  { name: 'محمد مصطفي', shopName: 'هاودي كيدز', address: 'طنطا', phone: '1276264019' },
  { name: 'احمد اشرف', shopName: 'باندا', address: 'ميت غمر', phone: '1207419368' },
  { name: 'مصطفى جمعه', shopName: 'هارفي', address: 'عين شمس', phone: '1000072278' },
  { name: 'منة الله محمود', shopName: 'نيمو اند دوري', address: 'الاسماعيليه', phone: '1003828259' },
  { name: 'صفا الحسيني', shopName: 'الملكه', address: 'المنصوره', phone: '1022839010' },
  { name: 'اشرف حمدي فرحات', shopName: 'نيمو كيدز', address: 'بركة السبع', phone: '1095459321' },
  { name: 'مشير مراد', shopName: 'خوخه كيدز', address: 'سوهاج', phone: '1223271122' },
  { name: 'محمد نصر', shopName: 'Kidz cloud', address: 'السويس', phone: '1061160243' },
  { name: 'احمد قنديل', shopName: 'بابلز', address: 'الدلنجات', phone: '1095198342' },
  { name: 'محمد صبري', shopName: 'كوكوبي', address: 'اسكندرية', phone: '1099997574' },
  { name: 'احمد تركي', shopName: 'باندا', address: 'ادكو', phone: '1282822433' },
  { name: 'وليد رياض', shopName: 'بيبي بير', address: 'اكتوبر', phone: '1014446584' },
  { name: 'عمرو العربى', shopName: 'أي كيدز', address: 'شبين الكوم', phone: '1099930331' },
  { name: 'توي اند جوي', shopName: 'توي اند جوي', address: 'سوهاج', phone: '201099650552' },
  { name: 'توفيق عزام', shopName: 'عزام', address: 'السنطة', phone: '1092394604' },
  { name: 'محمد يونس', shopName: 'محل النونو', address: 'مرسي مطروح', phone: '1555064957' },
  { name: 'خالد فتحله', shopName: 'خالد', address: 'الهرم', phone: '1093979300' },
  { name: 'محمود البكري', shopName: 'هاوس كيدز', address: 'كوم حمادة', phone: '201064010012' },
  { name: 'محمد عوض', shopName: 'ميني مي', address: 'شبراخيت', phone: '1555390385' },
  { name: 'محمود', shopName: 'كيدز هاوس', address: 'بني سويف', phone: '201006648606' },
  { name: 'سيد حسين', shopName: 'بيبي ماكس', address: 'الاسماعيليه', phone: '1202908365' },
  { name: 'نهي هاني', shopName: 'كيوت بيبي', address: 'السادات', phone: '1012478222' },
  { name: 'بطوط', shopName: 'بطوط', address: 'ادكو', phone: '1114390093' },
  { name: 'ايمن مكرم', shopName: 'كيو كيو', address: 'المحله', phone: '1200400259' },
  { name: 'محمد عاطف', shopName: 'بيبي ستور', address: 'اسيوط', phone: '1003319060' },
  { name: 'احمد شعبان', shopName: 'بيبي زون', address: 'سمنود', phone: '1222599918' },
  { name: 'حنان علي محمود', shopName: 'هاي بيبي', address: 'عباس العقاد', phone: '1152382811' },
  { name: 'دعاء رزق', shopName: 'سنتر روفانا', address: 'ابو حمص', phone: '1229273723' },
  { name: 'فرج', shopName: 'فرج', address: 'مطروح', phone: '1064308555' },
  { name: 'بدر', shopName: 'بيبي هاوس', address: 'فيصل', phone: '1148721695' },
  { name: 'Alaa Ahmed Younis', shopName: 'زيزي وبطوط', address: 'العاشر من رمضان', phone: '1017707188' },
  { name: 'عمرو', shopName: 'كوين حلوان', address: 'حلوان', phone: '1229792040' },
  { name: 'محمد الهادي', shopName: 'محل الهادي', address: 'ساحل سليم', phone: '1274032810' },
  { name: 'سمر جادالله', shopName: 'سمر جادالله', address: 'دمنهور', phone: '1010555273' },
  { name: 'بوي اند جيرل', shopName: 'بوي', address: 'طنطا', phone: '1091534618' },
  { name: 'ياسمين ممدوح', shopName: 'بنات في بنات', address: 'العاشر', phone: '1027997377' },
  { name: 'محمد غزال', shopName: 'غزال كيدز', address: 'شبين الكوم', phone: '100038088' },
  { name: 'احمد ابراهيم', shopName: 'بوتيك', address: 'الواسطى', phone: '1153780262' },
  { name: 'رباب محمد', shopName: 'اليس كيدز', address: 'اسيوط', phone: '1060424210' },
  { name: 'Magdy elsayed', shopName: 'X large', address: 'ههيا', phone: '1221310321' },
  { name: 'محمد وحيد', shopName: 'وحيد', address: 'منوف', phone: '1000256097' },
  { name: 'محمد صبحي', shopName: 'براندس كيدز', address: 'كوم حماده', phone: '1016557515' },
  { name: 'شيماء السيد', shopName: 'شيماء سيد', address: 'مشتول', phone: '1017279449' },
  { name: 'احمد خالد محمود', shopName: 'بيو بيبي', address: 'التل الكبير', phone: '1116024760' },
  { name: 'احمد جاب الله', shopName: 'كيدز ايلاند', address: 'الفيوم', phone: '1004746474' },
  { name: 'عبدالله عماد', shopName: 'Cutebaby', address: 'مدينة نصر', phone: '1025200546' },
  { name: 'عمر جمال', shopName: 'توينز كيدز', address: 'طوخ', phone: '1204000357' },
  { name: 'علي راضي', shopName: 'سلام للنونو', address: 'كفر الدوار', phone: '1227210107' },
  { name: 'آية اشرف', shopName: 'كيدز ستور', address: 'الباجور', phone: '1061594227' },
  { name: 'احمد شهاب', shopName: 'بامبينو', address: 'كفر الشيخ', phone: '1002025514' },
  { name: 'محمد ناجي', shopName: 'بيميو كيدز', address: 'المنصوره', phone: '1065100011' },
  { name: 'اسلام الطباخ', shopName: 'زين ستور', address: 'اشمون', phone: '1021509303' },
  { name: 'شبر ونص', shopName: 'شبر ونص', address: 'القوصيه', phone: '1283296896' },
  { name: 'هبة جمال', shopName: 'وندرلاند', address: 'حلوان', phone: '1095453144' },
  { name: 'اماني عثمان', shopName: 'مامي اند مي', address: 'ابنوب', phone: '1104752498' },
  { name: 'أمير يسري', shopName: 'مارشميلو', address: 'المنيا', phone: '1288676787' },
  { name: 'ببك', shopName: 'ببك', address: 'ملوي', phone: '1014499249' },
  { name: 'دعاء عبدالرحيم', shopName: 'ميكسات', address: 'الشرقيه', phone: '1014875785' },
  { name: 'Ahmed Mahmoud', shopName: 'Dokkan Istanbul', address: 'حلوان', phone: '1099122499' },
  { name: 'منال جمال', shopName: 'كركر', address: 'المنيا', phone: '1229712232' },
  { name: 'احمد المرسي', shopName: 'نينجا', address: 'المنيا', phone: '1066501558' },
  { name: 'اسامه حبيب', shopName: 'ركن البيبي', address: 'بلبيس', phone: '1022150374' },
  { name: 'محمود', shopName: 'لا بيبي', address: 'البحيره', phone: '1000286165' },
  { name: 'ايه صلاح', shopName: 'ليتل ستار', address: 'الزقازيق', phone: '1112348825' },
  { name: 'معاذ سليمان', shopName: 'محلات معاذ', address: 'بركة السبع', phone: '1206941920' },
  { name: 'عبدالرحمن', shopName: 'بومبا كيدز', address: 'الاقصر', phone: '1006887484' },
  { name: 'Olamahmoud', shopName: 'Loka', address: 'حدائق الاهرام', phone: '1028905511' },
  { name: 'محمد فتحي', shopName: 'جوي', address: 'طوخ', phone: '1270709913' },
  { name: 'رودي', shopName: 'رودي', address: 'بنها', phone: '1287560791' },
  { name: 'حالنا نونو', shopName: 'حالنا نونو', address: 'فيصل', phone: '1150006939' },
  { name: 'Sally Salama', shopName: 'Kitty kids', address: 'بيلا', phone: '1014449114' },
  { name: 'بيست كيدز', shopName: 'بيست كيدز', address: 'اسكندريه', phone: '1276636443' },
  { name: 'احمد قاسم', shopName: 'كيدز هاوس', address: 'اسكندريه', phone: '1007598600' },
  { name: 'محمد رجب', shopName: 'بامبينو فيصل', address: 'فيصل', phone: '1148825514' },
  { name: 'بيتر مجدي', shopName: 'لولي', address: 'العبور', phone: '1206086250' },
  { name: 'ندي عادل', shopName: 'لولي ماركت كيدز', address: 'طنطا', phone: '1002426268' },
  { name: 'خالد الشريف', shopName: 'كيدز زون', address: 'الفيوم', phone: '1005522303' },
  { name: 'احمد', shopName: 'ستار كيدز', address: 'الاسماعيليه', phone: '1273333008' },
  { name: 'أيمن السعدني', shopName: 'زياد ستور', address: 'العياط', phone: '1145535506' },
  { name: 'محمد محمد الغنيمي', shopName: 'نيمو', address: 'العبور', phone: '1207507606' },
  { name: 'حسن', shopName: 'محل تويتي', address: 'مطروح', phone: '1090801133' },
  { name: 'اكرامي رشاد', shopName: 'كتاكيت', address: 'السنطة', phone: '1206500529' },
  { name: 'احمد الوكيل', shopName: 'طيور الجنة', address: 'الشهداء', phone: '1001127377' },
  { name: 'وائل وهدان', shopName: 'اطفالنا', address: 'المنوفيه', phone: '201005260045' },
  { name: 'ثابت السعدي', shopName: 'الورده الراقيه', address: 'القاهره', phone: '1288277711' },
  { name: 'السيد الدمراوي', shopName: 'ورد ستور', address: 'المحله', phone: '1003712351' },
  { name: 'محمد ونيس', shopName: 'كيدز اوسيم', address: 'الجيزه', phone: '1002300835' },
  { name: 'احمد', shopName: 'محل شنشن', address: 'دمياط', phone: '1000227785' },
  { name: 'دينا السعيد', shopName: 'كيدز شوب', address: 'دمنهور', phone: '1021590990' },
  { name: 'محمد معتز', shopName: 'سنتر الدار', address: 'شبين الكوم', phone: '1093710351' },
  { name: 'اسلام مجدي', shopName: 'لوجو كيدز', address: 'قنا', phone: '1098050062' },
  { name: 'الاء محمد', shopName: 'بيبي فاشون', address: 'القصير', phone: '1097766176' },
  { name: 'عبدالله قاسم', shopName: 'ضي القمر', address: 'ادكو', phone: '1028838465' },
  { name: 'بارني', shopName: 'Barny', address: 'طنطا', phone: '201023024015' },
  { name: 'مصطفى البلاسي', shopName: 'بيبي كير', address: 'منيا القمح', phone: '1060101018' },
  { name: 'لينا يحي', shopName: 'Up and up', address: 'الرحاب', phone: '1129000876' },
  { name: 'محمد كمال', shopName: 'Online bubbles', address: 'المعادي', phone: '1126948375' },
  { name: 'احمد سمير', shopName: 'توب شوب', address: 'دكرنس', phone: '1000845538' },
  { name: 'Khaled', shopName: 'Kidia', address: 'اسكندريه', phone: '1285405905' },
  { name: 'مازن محمود', shopName: 'Just brand', address: 'دمياط', phone: '1020106700' },
  { name: 'جورج ميخائيل', shopName: 'لولي بوب', address: 'المنيا', phone: '1281288208' },
  { name: 'بامبينو', shopName: 'بامبينو', address: 'الاقصر', phone: '1221045933' },
  { name: 'منه مصطفى', shopName: 'لايف كير', address: 'بورسعيد', phone: '1060255200' },
  { name: 'هاني عزالدين', shopName: 'كيدزى', address: 'اسكندريه', phone: '1013510142' },
  { name: 'اسلام محمد', shopName: 'ستار كيدس', address: 'شوكت', phone: '213540014724' },
  { name: 'عبدالرحمن محمد', shopName: 'ملائكه الرحمه', address: 'اسوان', phone: '1111167898' },
  { name: 'Mohamed Adel', shopName: 'Lolo kids', address: 'الصف الجيزه', phone: '1028716464' },
  { name: 'عدي', shopName: 'بوابه النيل', address: 'فلسطين', phone: '972586722962' },
  { name: 'حنان', shopName: 'سكريم كيدز', address: 'الف مسكن', phone: '1005697545' },
  { name: 'هايدي ماهر', shopName: 'بلوبينك', address: 'المنيا الجديده', phone: '120838728' },
  { name: 'محمود عبد المنعم', shopName: 'يتربى في عزك', address: 'كفر الدوار', phone: '1223283191' },
  { name: 'Mohamed Hassan', shopName: 'Plantos store', address: 'اسكندريه', phone: '1287296026' },
  { name: 'شيماء ابو زيد', shopName: 'فانيلا', address: 'ميت غمر', phone: '1112570511' },
  { name: 'مكتب اسامه عزيز', shopName: 'Dragon', address: 'وسط البلد', phone: '1274242477' },
  { name: 'شريف فكري', shopName: 'فلامنكو', address: 'بنها', phone: '201005614440' },
  { name: 'سيفورا', shopName: 'سيفورا', address: 'امبابه', phone: '1093979300' },
  { name: 'زينب فرج', shopName: 'دنيا الاطفال', address: 'القناطر', phone: '1122911267' },
  { name: 'سندريلا المنصوره', shopName: 'سندريلا', address: 'المنصوره', phone: '1020060039' },
  { name: 'متاريك', shopName: 'متاريك', address: 'دمياط', phone: '1010051265' },
  { name: 'بلو بي', shopName: 'نانسي بلو بي', address: 'المنصوره', phone: '1023834805' },
  { name: 'بلال عادل', shopName: 'بومبا وميمونه', address: 'الزقازيق', phone: '1140177229' },
  { name: 'مكتب ديزني', shopName: 'سالي سعد', address: 'شربين', phone: '107589842' },
  { name: 'نيروز', shopName: 'ادم استور', address: 'اكتوبر', phone: '201004675099' },
  { name: 'محمد طاهر', shopName: 'الحرمين', address: 'ميت غمر', phone: '1112570511' },
  { name: 'السباخي', shopName: 'السباخي', address: 'ايتاي البارود', phone: '201060203960' },
  { name: 'خالد', shopName: 'الجزائر', address: 'الجزائر', phone: '213550152068' },
  { name: 'بوي اند جيريل', shopName: 'محمود', address: 'المنصوره', phone: '1002671347' },
  { name: 'عبدالرحمن ناصر', shopName: 'N Shop', address: 'المنصوره', phone: '1009761008' },
  { name: 'ام كريم', shopName: 'كوكي ومالك', address: 'المرج', phone: '1159524367' },
  { name: 'كمال فتحي', shopName: 'بيبي كيمو', address: 'امبابه', phone: '1113134330' },
  { name: 'احمد شوقي', shopName: 'ملايكه', address: 'الشهداء', phone: '1000349492' },
  { name: 'عبدالعزيز الحداد', shopName: 'شيك كيدز', address: 'بركة السبع', phone: '1001105426' },
  { name: 'محمد سعد', shopName: 'فرصه', address: 'الزقازيق', phone: '1017001155' },
  { name: 'ابراهيم حلمي', shopName: 'بابلز', address: 'اكتوبر', phone: '1096419747' },
  { name: 'سالى سامح', shopName: 'الزهراء', address: 'الاسماعيليه', phone: '1279970144' },
  { name: 'احمد محروس', shopName: 'كيتي', address: 'ادكو', phone: '1207163889' },
  { name: 'محمد سلطان', shopName: 'كيزو', address: 'منوف', phone: '1000094497' },
  { name: 'مصطفى', shopName: 'لعب عيال', address: 'الاسماعيليه', phone: '1150393635' },
  { name: 'محمود جمال عبدالمولي', shopName: 'سنتر اليسر', address: 'النوباريه', phone: '1004470660' },
  { name: 'محمود دياب', shopName: 'تفاحه كيدز', address: 'السيده زينب', phone: '1113999777' },
  { name: 'محمد ابراهيم الدسوقي', shopName: 'مول العائلة', address: 'العامرية', phone: '1227595322' },
  { name: 'البخاري', shopName: 'البخاري', address: 'المنصوره', phone: '1004880730' },
  { name: 'عبد المسيح', shopName: 'نيو بيبي', address: 'المعادي', phone: '1223690309' },
  { name: 'ابوالحسن', shopName: 'محمود ابو الحسن', address: 'السيده زينب', phone: '1006707813' },
  { name: 'احمد فرج', shopName: 'مول الحبيب', address: 'قنا', phone: '1271875337' },
  { name: 'محمد صادق', shopName: 'بامبينو', address: 'الاسماعيليه', phone: '1200766332' },
  { name: 'ميلاد سمير', shopName: 'لالا لاند', address: 'عين شمس', phone: '1211892269' },
  { name: 'الحج محمد عبد الهادي', shopName: 'احمد عبد الهادي', address: 'المنصوره', phone: '1002715559' },
  { name: 'كيرلس وهبه', shopName: 'كوكو واو', address: 'التجمع الخامس', phone: '1127744343' },
  { name: 'دكتوره حفصه ابراهيم', shopName: 'د بيبي', address: 'القناطر', phone: '1066067724' },
  { name: 'احمد خليل', shopName: 'بيبي شوب', address: 'اوسيم', phone: '1129794935' },
  { name: 'ابو الحسن', shopName: 'ابو الحسن', address: 'السيده', phone: '1006707813' },
  { name: 'احمد', shopName: 'شنشن', address: 'دمياط', phone: '1000227785' },
  { name: 'اسلام محمد', shopName: 'ستار كيدس', address: 'شركة شوكت', phone: '213540014724' },
  { name: 'خالد الشريف', shopName: 'كيدز زون الفيوم', address: 'الفيوم', phone: '1005522303' },
  { name: 'احمد', shopName: 'ستار كيدز', address: 'الاسماعيليه', phone: '1273333008' },
  { name: 'محمد ونيس', shopName: 'كيدز اوسيم', address: 'الجيزه', phone: '1002300835' },
];

const depositMethods = [
  { value: 'cash', label: 'كاش' },
  { value: 'instapay', label: 'InstaPay' },
  { value: 'vodafone_cash', label: 'فودافون كاش' },
];

const sendTelegramNotificationClientSide = async (payload: any) => {
  try {
    // 1. Fetch token and chat ID from app_settings
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['telegram_bot_token', 'telegram_chat_id']);
    
    const botToken = settings?.find(s => s.key === 'telegram_bot_token')?.value || import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
    const chatId = settings?.find(s => s.key === 'telegram_chat_id')?.value || import.meta.env.VITE_TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.warn('Telegram notifications not sent: bot token or chat ID is missing.');
      return;
    }

    const { orderNumber, customerName, shopName, phone, address, items, subtotal, total, depositAmount, depositMethod, extraInfo, lowStockProducts, staffName } = payload;

    const escapeMarkdown = (text: string): string => {
      if (!text) return '';
      return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    };

    // Build message
    let message = `🧸 *طلب جديد \\#${orderNumber}*\n\n`;
    if (staffName) {
      message += `👷 *بواسطة موظف:* ${escapeMarkdown(staffName)}\n`;
    }
    message += `👤 *العميل:* ${escapeMarkdown(customerName)}\n`;
    if (shopName) message += `🏪 *المحل:* ${escapeMarkdown(shopName)}\n`;
    message += `📞 *الهاتف:* ${escapeMarkdown(phone)}\n`;
    if (address) message += `📍 *العنوان:* ${escapeMarkdown(address)}\n`;
    if (extraInfo) message += `📝 *ملاحظات:* ${escapeMarkdown(extraInfo)}\n`;
    message += `\n━━━━━━━━━━━━━━━━\n`;
    message += `📦 *المنتجات:*\n\n`;

    if (items && Array.isArray(items)) {
      items.forEach((item: any, index: number) => {
        message += `${index + 1}\\. ${escapeMarkdown(item.name)}\n`;
        message += `   الكود: ${escapeMarkdown(item.code)}\n`;
        message += `   الكمية: ${item.quantity}\n`;
        message += `   السعر: ${item.price} ج\\.م\n\n`;
      });
    }

    message += `━━━━━━━━━━━━━━━━\n`;
    message += `💰 *الإجمالي:* ${subtotal} ج\\.م\n`;
    if (depositAmount > 0) {
      const methodLabel = depositMethod === 'instapay' ? 'InstaPay' : 
                         depositMethod === 'vodafone_cash' ? 'فودافون كاش' : 'كاش';
      message += `💵 *العربون \\(${escapeMarkdown(methodLabel)}\\):* ${depositAmount} ج\\.م\n`;
    }
    message += `✅ *المطلوب:* ${total} ج\\.م`;

    // Add low stock alert if any
    if (lowStockProducts && Array.isArray(lowStockProducts) && lowStockProducts.length > 0) {
      message += `\n\n🚨🚨 *تنبيه نقص المخزون* 🚨🚨\n\n`;
      lowStockProducts.forEach((p: any) => {
        const statusEmoji = p.remaining <= 0 ? '🔴' : '🟡';
        const statusText = p.remaining <= 0 ? 'نفذ من المخزون' : `متبقي ${p.remaining} قطعة فقط`;
        message += `${statusEmoji} ${escapeMarkdown(p.code)} \\- ${escapeMarkdown(p.name)}: *${escapeMarkdown(statusText)}*\n`;
      });
    }

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'MarkdownV2',
      }),
    });

    if (!response.ok) {
      const result = await response.json();
      console.error('Telegram API error:', result);
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
};

const Checkout = () => {
  const navigate = useNavigate();
  const { items, subtotal, clearCart, extraInfo } = useCart();
  const [loading, setLoading] = useState(false);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [orderDetails, setOrderDetails] = useState<{
    items: typeof items;
    subtotal: number;
    total: number;
    depositAmount: number;
    depositMethod: string;
    customerName: string;
    shopName: string;
    phone: string;
    address: string;
    extraInfo: string;
  } | null>(null);
  const [isOldCustomer, setIsOldCustomer] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [dbCustomers, setDbCustomers] = useState<typeof oldCustomersData>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    shopName: '',
    phone: '',
    address: '',
    deliveryDate: '',
    shippingCompany: '',
    depositMethod: 'cash',
    depositAmount: 0,
  });

  const total = subtotal - formData.depositAmount;

  // Load old customers from database (is_new = false)
  useEffect(() => {
    const loadDbCustomers = async () => {
      const { data } = await supabase
        .from('customers')
        .select('name, shop_name, phone, address')
        .eq('is_new', false);
      
      if (data) {
        const mapped = data.map(c => ({
          name: c.name,
          shopName: c.shop_name || '',
          address: c.address || '',
          phone: c.phone,
        }));
        setDbCustomers(mapped);
      }
    };
    loadDbCustomers();
  }, []);

  // Filter customers based on search
  // Normalize phone number - remove leading 0, 20, 2, country codes
  const normalizePhone = (phone: string): string => {
    let normalized = phone.replace(/\D/g, ''); // Remove non-digits
    // Remove common country codes and leading zeros
    if (normalized.startsWith('20')) normalized = normalized.slice(2);
    if (normalized.startsWith('0')) normalized = normalized.slice(1);
    return normalized;
  };

  // Combine hardcoded + DB customers, deduplicate by normalized phone
  const allOldCustomers = useMemo(() => {
    const phoneMap = new Map<string, typeof oldCustomersData[0]>();
    // DB customers take priority (more recent data)
    for (const c of dbCustomers) {
      phoneMap.set(normalizePhone(c.phone), c);
    }
    // Add hardcoded ones only if phone not already present
    for (const c of oldCustomersData) {
      const norm = normalizePhone(c.phone);
      if (!phoneMap.has(norm)) {
        phoneMap.set(norm, c);
      }
    }
    return Array.from(phoneMap.values());
  }, [dbCustomers]);

  // Only show customer when exact phone match is found
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const searchNormalized = normalizePhone(customerSearch);
    
    // Must have at least 9 digits for a valid phone search
    if (searchNormalized.length < 9) return [];
    
    return allOldCustomers.filter((c) => {
      const customerPhoneNormalized = normalizePhone(c.phone);
      return customerPhoneNormalized === searchNormalized ||
             c.name.toLowerCase() === customerSearch.toLowerCase();
    });
  }, [customerSearch, allOldCustomers]);

  const handleOldCustomerToggle = () => {
    setIsOldCustomer(!isOldCustomer);
    if (isOldCustomer) {
      setFormData({
        ...formData,
        name: '',
        shopName: '',
        phone: '',
        address: '',
      });
      setCustomerSearch('');
    }
  };

  const handleOldCustomerSelect = (customer: typeof oldCustomersData[0]) => {
    setFormData({
      ...formData,
      name: customer.name,
      shopName: customer.shopName,
      address: customer.address,
      phone: customer.phone,
    });
    setShowCustomerDropdown(false);
    setCustomerSearch('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.phone) {
      toast.error('يرجى ملء الحقول المطلوبة');
      return;
    }

    setLoading(true);

    try {
      // Get active version
      const { data: activeVersion } = await supabase
        .from('versions')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();

      if (!activeVersion) {
        toast.error('لا توجد نسخة نشطة');
        setLoading(false);
        return;
      }

      const versionId = activeVersion.id;

      // Create or find customer
      let customerId: string | null = null;
      
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', formData.phone)
        .eq('version_id', versionId)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        await supabase
          .from('customers')
          .update({ is_new: false })
          .eq('id', customerId);
      } else {
        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert({
            name: formData.name,
            shop_name: formData.shopName || null,
            phone: formData.phone,
            address: formData.address || null,
            is_new: !isOldCustomer,
            version_id: versionId,
          })
          .select('id')
          .single();

        if (customerError) throw customerError;
        customerId = newCustomer.id;
      }

      // Get next order number for this version
      const { data: nextOrderNum } = await supabase.rpc('get_next_order_number', { p_version_id: versionId });
      const orderNumber = nextOrderNum || 1;

      // Check if staff member is logged in
      const staffSession = sessionStorage.getItem('babyland_staff');
      const staffData = staffSession ? JSON.parse(staffSession) : null;

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: customerId,
          customer_name: formData.name,
          shop_name: formData.shopName || null,
          phone: formData.phone,
          address: formData.address || null,
          delivery_date: formData.deliveryDate || null,
          shipping_company: formData.shippingCompany || null,
          deposit_method: formData.depositMethod || null,
          deposit_amount: formData.depositAmount,
          subtotal: subtotal,
          total: total,
          extra_info: extraInfo || null,
          version_id: versionId,
          order_number: orderNumber,
          staff_member_id: staffData?.id || null,
          staff_member_name: staffData?.name || null,
        } as any)
        .select('id, order_number')
        .single();

      if (orderError) throw orderError;

      if (order) {
        const orderItemsWithId = items.map(item => ({
          order_id: order.id,
          product_id: item.productId,
          product_code: item.code,
          product_name: item.name,
          product_description: item.description,
          price: item.price,
          quantity: item.quantity,
          version_id: versionId,
        }));

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItemsWithId);

        if (itemsError) throw itemsError;
      }

      // Mark customer as old after successful order so they appear in old customer search next time
      if (customerId) {
        await supabase
          .from('customers')
          .update({ is_new: false })
          .eq('id', customerId);
      }

      const productIds = items.map(item => item.productId);
      const { data: updatedProducts } = await supabase
        .from('products')
        .select('id, code, name, stock_quantity, low_stock_threshold')
        .in('id', productIds);

      const lowStockProducts = updatedProducts?.filter(
        p => p.stock_quantity <= p.low_stock_threshold
      ) || [];

      // Save stock alerts to database
      if (lowStockProducts.length > 0) {
        const alertInserts = lowStockProducts.map(p => ({
          product_id: p.id,
          product_code: p.code,
          product_name: p.name,
          remaining_quantity: p.stock_quantity,
          version_id: versionId,
        }));
        try {
          await supabase.from('stock_alerts').insert(alertInserts as any);
        } catch (err) {
          console.error('Failed to save stock alerts:', err);
        }
      }

      // Send Telegram notification (fire and forget)
      sendTelegramNotificationClientSide({
        orderNumber: order.order_number,
        customerName: formData.name,
        shopName: formData.shopName,
        phone: formData.phone,
        address: formData.address,
        staffName: staffData?.name || null,
        items: items.map(item => ({
          name: item.name,
          code: item.code,
          quantity: item.quantity,
          price: item.price,
        })),
        subtotal,
        total,
        depositAmount: formData.depositAmount,
        depositMethod: formData.depositMethod,
        extraInfo: extraInfo,
        lowStockProducts: lowStockProducts.map(p => ({
          code: p.code,
          name: p.name,
          remaining: p.stock_quantity,
        })),
      }).catch(err => console.error('Telegram notification failed:', err));

      // Store order details for WhatsApp invoice
      setOrderDetails({
        items: [...items],
        subtotal,
        total,
        depositAmount: formData.depositAmount,
        depositMethod: formData.depositMethod,
        customerName: formData.name,
        shopName: formData.shopName,
        phone: formData.phone,
        address: formData.address,
        extraInfo: extraInfo,
      });
      setOrderNumber(order.order_number);
      clearCart();
      toast.success(`تم إرسال الطلب رقم ${order.order_number} بنجاح!`);
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error('حدث خطأ في إرسال الطلب');
    } finally {
      setLoading(false);
    }
  };

  // Generate invoice text for WhatsApp
  const generateWhatsAppInvoice = () => {
    if (!orderNumber || !orderDetails) return '';
    
    let invoiceText = `🧸 *Babyland - فاتورة رقم ${orderNumber}*\n\n`;
    invoiceText += `👤 *العميل:* ${orderDetails.customerName}\n`;
    if (orderDetails.shopName) invoiceText += `🏪 *المحل:* ${orderDetails.shopName}\n`;
    invoiceText += `📞 *الهاتف:* ${orderDetails.phone}\n`;
    if (orderDetails.address) invoiceText += `📍 *العنوان:* ${orderDetails.address}\n`;
    invoiceText += `📅 *التاريخ:* ${new Date().toLocaleDateString('ar-EG')}\n`;
    if (orderDetails.extraInfo) invoiceText += `📝 *ملاحظات:* ${orderDetails.extraInfo}\n`;
    invoiceText += `\n━━━━━━━━━━━━━━━━\n`;
    invoiceText += `📦 *المنتجات:*\n\n`;
    
    orderDetails.items.forEach((item, index) => {
      const multiplier = getDescriptionMultiplier(item.description);
      const itemTotal = calculateItemTotal(item);
      const displayQty = multiplier > 1 ? item.quantity * multiplier : item.quantity;
      invoiceText += `${index + 1}. ${item.name}\n`;
      invoiceText += `   الكود: ${item.code}\n`;
      invoiceText += `   الكمية: ${displayQty}\n`;
      invoiceText += `   الإجمالي: ${itemTotal.toFixed(2)} ج.م\n\n`;
    });
    
    invoiceText += `━━━━━━━━━━━━━━━━\n`;
    invoiceText += `💰 *الإجمالي الفرعي:* ${orderDetails.subtotal.toFixed(2)} ج.م\n`;
    if (orderDetails.depositAmount > 0) {
      const methodLabel = orderDetails.depositMethod === 'instapay' ? 'InstaPay' : 
                         orderDetails.depositMethod === 'vodafone_cash' ? 'فودافون كاش' : 'كاش';
      invoiceText += `💵 *العربون (${methodLabel}):* -${orderDetails.depositAmount.toFixed(2)} ج.م\n`;
    }
    invoiceText += `✅ *المطلوب:* ${orderDetails.total.toFixed(2)} ج.م\n\n`;
    invoiceText += `شكراً لتعاملكم مع Babyland 🎀`;
    
    return invoiceText;
  };

  const openWhatsApp = () => {
    if (!orderDetails) return;
    const invoiceText = generateWhatsAppInvoice();
    // Format phone for WhatsApp - ensure it starts with country code
    let whatsappPhone = orderDetails.phone.replace(/\D/g, '');
    if (whatsappPhone.startsWith('0')) whatsappPhone = '2' + whatsappPhone;
    if (!whatsappPhone.startsWith('2')) whatsappPhone = '2' + whatsappPhone;
    if (!whatsappPhone.startsWith('20')) whatsappPhone = '20' + whatsappPhone.slice(1);
    
    const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(invoiceText)}`;
    window.open(whatsappUrl, '_blank');
  };

  if (orderNumber) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-baby-blue-light via-background to-baby-pink-light">
        <Header />
        <main className="container py-12">
          <Card className="max-w-md mx-auto text-center border-2 border-primary/20 shadow-baby-lg">
            <CardContent className="py-12">
              <div className="w-20 h-20 rounded-full bg-gradient-to-l from-primary to-secondary flex items-center justify-center mx-auto mb-6 animate-bounce-soft">
                <Check className="h-10 w-10 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-bold mb-2">تم إرسال طلبك بنجاح!</h1>
              <p className="text-muted-foreground mb-4">رقم الطلب الخاص بك</p>
              <div className="text-5xl font-bold gradient-text mb-8">{orderNumber}</div>
              <div className="space-y-3">
                <Button 
                  onClick={openWhatsApp} 
                  className="w-full rounded-xl bg-green-500 hover:bg-green-600"
                >
                  <MessageCircle className="h-5 w-5 ml-2" />
                  فتح المحادثة في واتساب
                </Button>
                <Button onClick={() => navigate('/')} variant="outline" className="w-full rounded-xl">
                  العودة للرئيسية
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-baby-blue-light via-background to-baby-pink-light">
      <Header />
      
      <main className="container py-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-4 gap-2"
        >
          <ArrowRight className="h-4 w-4" />
          العودة للتسوق
        </Button>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Order Summary */}
          <Card className="border-2 border-primary/20 shadow-baby h-fit">
            <CardHeader>
             <CardTitle className="flex items-center gap-2">
                ملخص الطلب
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">السلة فارغة</p>
              ) : (
                <>
                  {items.map((item) => {
                    const multiplier = getDescriptionMultiplier(item.description);
                    const itemTotal = calculateItemTotal(item);
                    return (
                      <div key={item.id} className="flex gap-3 items-center py-2 border-b border-border last:border-0">
                        <ProductImage imageUrl={item.imageUrl} alt={item.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {multiplier > 1 
                              ? `${item.quantity} × ${item.price} × ${multiplier} ج.م`
                              : `${item.quantity} × ${item.price} ج.م`
                            }
                          </p>
                        </div>
                        <span className="font-bold flex-shrink-0">{itemTotal.toFixed(2)} ج.م</span>
                      </div>
                    );
                  })}
                  <div className="pt-4 space-y-2">
                    <div className="flex justify-between">
                      <span>الإجمالي الفرعي</span>
                      <span>{subtotal.toFixed(2)} ج.م</span>
                    </div>
                    {formData.depositAmount > 0 && (
                      <div className="flex justify-between text-secondary">
                        <span>العربون</span>
                        <span>- {formData.depositAmount.toFixed(2)} ج.م</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xl font-bold border-t pt-2">
                      <span>المطلوب</span>
                      <span className="text-primary">{total.toFixed(2)} ج.م</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Checkout Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer Info */}
            <Card className="border-2 border-border">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    بيانات العميل
                  </span>
                  <Button
                    type="button"
                    variant={isOldCustomer ? 'default' : 'outline'}
                    size="sm"
                    onClick={handleOldCustomerToggle}
                  >
                    {isOldCustomer ? 'عميل قديم' : 'عميل جديد'}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isOldCustomer && (
                  <div className="relative">
                    <Label>ابحث عن عميل بالاسم الكامل أو رقم الهاتف</Label>
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="ادخل رقم الهاتف كامل (01033110143)..."
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setShowCustomerDropdown(true);
                        }}
                        className="pr-10"
                        dir="ltr"
                      />
                    </div>
                    {showCustomerDropdown && filteredCustomers.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-background border rounded-lg shadow-lg">
                        {filteredCustomers.map((customer, index) => (
                          <button
                            key={index}
                            type="button"
                            className="w-full p-3 text-right hover:bg-muted border-b last:border-b-0 transition-colors"
                            onClick={() => handleOldCustomerSelect(customer)}
                          >
                            <p className="font-medium">{customer.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {customer.shopName} - {customer.phone}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="name">الاسم *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="shopName">اسم المحل</Label>
                    <Input
                      id="shopName"
                      value={formData.shopName}
                      onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">رقم الهاتف *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <Label htmlFor="address">العنوان</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Shipping */}
            <Card className="border-2 border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  الشحن
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="deliveryDate">تاريخ التسليم</Label>
                    <Input
                      id="deliveryDate"
                      type="date"
                      value={formData.deliveryDate}
                      onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <Label htmlFor="shippingCompany">شركة الشحن</Label>
                    <Input
                      id="shippingCompany"
                      value={formData.shippingCompany}
                      onChange={(e) => setFormData({ ...formData, shippingCompany: e.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment */}
            <Card className="border-2 border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  العربون
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>طريقة الدفع</Label>
                  <RadioGroup
                    value={formData.depositMethod}
                    onValueChange={(value) => setFormData({ ...formData, depositMethod: value })}
                    className="flex gap-4 mt-2"
                  >
                    {depositMethods.map((method) => (
                      <div key={method.value} className="flex items-center gap-2">
                        <RadioGroupItem value={method.value} id={method.value} />
                        <Label htmlFor={method.value} className="cursor-pointer">
                          {method.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* InstaPay Message */}
                {formData.depositMethod === 'instapay' && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
                    <p className="font-bold mb-2">اضغط الرابط لارسال نقود الى</p>
                    <a 
                      href="https://ipn.eg/S/basom.1980/instapay/44SGmu" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline font-bold block mb-2"
                    >
                      https://ipn.eg/S/basom.1980/instapay/44SGmu
                    </a>
                    <p className="text-sm">basom.1980@instapay</p>
                    <p className="text-xs text-blue-600 mt-1">Powered by InstaPay</p>
                  </div>
                )}

                {/* Vodafone Cash Message */}
                {formData.depositMethod === 'vodafone_cash' && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                    <p className="font-bold mb-2">رقم فودافون كاش:</p>
                    <p className="text-2xl font-bold" dir="ltr">01001608562</p>
                  </div>
                )}

                <div>
                  <Label htmlFor="depositAmount">قيمة العربون</Label>
                  <Input
                    id="depositAmount"
                    type="number"
                    min="0"
                    max={subtotal}
                    value={formData.depositAmount || ''}
                    onChange={(e) => setFormData({ ...formData, depositAmount: parseFloat(e.target.value) || 0 })}
                    dir="ltr"
                  />
                </div>
              </CardContent>
            </Card>

            <Button
              type="submit"
              disabled={loading || items.length === 0}
              className="w-full py-6 text-lg font-bold rounded-xl bg-gradient-to-l from-primary to-secondary shadow-baby-lg hover:shadow-pink transition-all"
            >
              {loading ? 'جاري الإرسال...' : 'تأكيد الطلب'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Checkout;
