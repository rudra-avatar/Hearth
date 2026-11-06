# Widget: the clock, the date and the weather

The widget is the group of time, date and weather at the top of the home screen. Find it in **Settings, Widget**. A small live picture of it sits beside the list, so you see each change right away.

![Widget tab with live preview](../screenshots/settings-widget.jpg)

- **Show widget:** switches all of it off if you want a clean screen.
- **Time and date:** 12-hour, 24-hour or the same as the TV; show the date; show AM or PM.
- **Widget look:** size, font (27 typefaces), thickness, position (up-down and left-right, 50 is the middle), alignment (left, centre or right), colour, shadow, backdrop and opacity. A light picture makes white text hard to read: choose a dark colour, a shadow or a backdrop. The *backdrop* is a soft dark or light glow behind the widget that fades out towards its edges; Off, or 5 to 100 percent in steps of 5 (more percent = stronger); it is dark behind light text and light behind dark text. It is Off until you turn it on. *Follow theme* picks a nice colour for each theme.
- **Weather:** off at first. Switch it on, choose **City** and the **temperature unit** (Celsius or Fahrenheit), and choose whether the city name and today's high and low show. Pick a city from the list of about 75, or choose **Search for a city** and type any place.

![Home with the weather line](../screenshots/home-weather.jpg)

- **TV load** (rooted TVs): off at first. Switch on **Show TV load** and a quiet line under the weather shows how busy the TV is: **CPU** (percent), **RAM** (used of total), **Storage** (free space on the TV's app storage) and **Net** (download and upload speed, all network connections together). It follows the widget's font, colour, shadow, backdrop and alignment. The figures come from the TV itself (`/proc` and `df`, read through the Homebrew Channel), every 3 seconds while Hearth is in front; nothing is read while an app or input is open, and nothing leaves the TV. CPU and Net show a dash for the first 3 seconds, because they are measured between two readings. On a TV that is not rooted the row is grey.

## About the weather and privacy

The weather comes from [Open-Meteo](https://open-meteo.com), a free service with no account. Hearth sends only the place's map position (and the words you type in the city search). It asks a few seconds after Hearth appears and then every 30 minutes while Hearth is in front. The last answer is kept, so the home screen never waits for the internet. An answer older than 6 hours is not shown. It needs the TV to be online.
