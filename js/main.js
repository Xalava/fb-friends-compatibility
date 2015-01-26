// Some internal variables
//========================

var myData = myData || {
	scope : 'public_profile,user_likes,user_friends', // Additional permissions.
}
var categories = categories || ['books', 'games', 'movies', 'music'];
var err_msgs = err_msgs || [
	{'field' : 'friends', 'msg' : "It looks like something went wrong while retrieving your list of friends."},
	{'field' : 'games', 'msg' : "It looks like something went wrong while a list of games that you've liked. Are you sure that you've liked some Game pages recently?"}
]
var compatibleFriends = compatibleFriends || {}  


// Application logic
//==================

// Fetches basic user and friend information and sets up the UI.
function initializeApp() {
	// Finalizes user's friends basic info after second Ajax.
	var apiCallback2 = function(response) {
				console.log("apiCallback2");

		myData.myFriends = response.data;
		var err_msg = _.findWhere(err_msgs, {'field' : 'friends'});
		if(errorChecking(myData.myFriends, err_msg)) { console.log(err_msg); return; } // Stop application on error.
		// Initialize some counters for API calls later on.
		for (var i=0; i<categories.length; i++) {
			myData[categories[i] + 'toProcess'] = myData.myFriends.length; 
		}
		for (var i=0; i<myData.myFriends.length; i++) {
			myData.myFriends[i]['mutualFaves'] = { 'books' : [], 'games' : [], 'movies' : [], 'music' : [] };
		}
		// Presentation & UI.
		boot_hide('#unauth-div');
		boot_show('#auth-div');
		bindButtonCalculations();
	}
	// Finalizes basic user info after first Ajax.
	var apiCallback1 = function(response) {
		console.log("apiCallback1");
		myData.me = response;
		var possible = [response.first_name, response.name, response.username, response.id];
		myData.greetingName = _(possible).chain()
			.compact().first().value(); // Gets the first not-null string to use as greetings!
		if(myData.greetingName) {
			$('#auth-greetings').html("Greetings " + myData.greetingName + "!");
		}
		// Sets the profile picture on the left to the current user.
		var imgSrc = getGraphImgSrc(myData.me.id) + "?type=large";
		$('<img id="profile-image" style="display: none;" src="' + imgSrc +'" />').appendTo('#left-div');
		$('#profile-image').toggle('slow');
	}
	console.log("Init infos in initializeApp");
	// Gets user info from Facebook
	FB.api('/me', apiCallback1);
	// Get friends info from Facebook
	FB.api('/me/friends', apiCallback2);
}

// Makes the appropriate button commence calculations if pressed.
function bindButtonCalculations() {
	for (var i=0; i<categories.length; i++) {
		$('#start-' + categories[i]).on("click", { i : i }, function(event) {
			var category = categories[event.data.i];
			// Callback after fetching my pages from category.
			var apiCallback1 = function(response) {
				if(response.data) {
					myData.me[category] = response.data;
				} else { alert('Error fetching my data for ' + category); }
				// UI: hide the button and show progress bar.
				$('#start-' + category).remove();
				$('#bar-' + category).removeClass('invisible');
				// Now need to make a call for each friend.
				for (var j=0; j < myData.myFriends.length; j++) {
					fbApiFriendCategoryWrapper(j, category);
				}
			}
			
			// Start by getting user pages for category.
			FB.api('me/' + category, apiCallback1)
		});
	}
}

// Wrapper for API calls for an individual friend's category pages 
function fbApiFriendCategoryWrapper(index, category) {
	var friend = myData.myFriends[index];
	FB.api(friend.id + '/' + category, function(response) {
		if (response.data) {
			// Makes sure that we always store as Array.
			if ($.isArray(response.data)) {
				friend[category] = response.data;
			} else {
				friend[category] = [ response.data ];
			}
		}
		var toProcessStr = category + "toProcess";
		var barStr = "#bar-" + category;
		myData[toProcessStr]--;
		updateProgressBar(index, myData.myFriends.length, barStr);
		if (myData[toProcessStr] == 0) {
			// Enter calculations only when all responses were retrieved.
			calculateSimilarities(category);
		} else if (myData[toProcessStr] < 0) {
			alert("Something went terribly wrong...");
		}
	});
}

// Returns a sorted list of friends, according to similarities in pages for given category 
function calculateSimilarities(category) {
	var barStr = "#bar-" + category;
	// Extracts a simple array of ids of my pages.
	var myPageIds = new Array();
	for (var i=0; i < myData.me[category].length; i++) {
		myPageIds.push(myData.me[category][i].id);
		var barStr = "#bar-" + category;
		updateProgressBar(i, myData.me[category].length, barStr);
	}
	// For each friend, go through their list of pages (if any) a remove pages not on my list.
	for (var i=0; i < myData.myFriends.length; i++) {
		// i-th friend
		//myData.myFriends[i].mutualFaves[category] = []
		if (myData.myFriends[i][category].length > 0) {
			var friendCategoryList = myData.myFriends[i][category];
			for (var j=0; j < friendCategoryList.length; j++) {
				// Their j-th page
				var friendPageId = friendCategoryList[j].id;
				if (myPageIds.indexOf(friendPageId) >= 0) {
					// Their page is on our list of favourites.
					myData.myFriends[i].mutualFaves[category].push(friendPageId);
				}
			}
		}
		updateProgressBar(i, myData.myFriends.length, barStr);
	}
	// Create a new array, sorted by the number of mutual favourites in given category
	compatibleFriends[category] = _.clone(myData.myFriends).sort(function(u1, u2){
		if (u1.mutualFaves[category].length < u2.mutualFaves[category].length) return 1;
		if (u1.mutualFaves[category].length > u2.mutualFaves[category].length) return -1;
		return 0
	});
	$(barStr + "-wrap").remove(); // Removes the progress bar for this category.
	displayResults(category); // Calls the function which presents compatible friends for this page category.
}

function displayResults(category) {
	placeholder = $('#placeholder-' + category);
	// Make sure that at least one friend has some pages in common.
	var nFriends = compatibleFriends[category].length;
	var tableId = "table-" + category; // Id for DOM element. 
	if (compatibleFriends[category][0].mutualFaves[category].length > 0) {
		$('<p class="lead">The following friends share your taste in ' + category
			+ ':</p><table id="' + tableId +'" class="table" style="width: 100%;"></table>').insertBefore(placeholder);
		// Generates a table row for each friend and prepends it to the previously created table.
		var table = $('#' + tableId);
		for (var i=0; i < nFriends; i++) {
			var friend = compatibleFriends[category][i];
			if (friend.mutualFaves[category].length > 0) {
				var row = "<tr>"; // Resulting html for the row
				var nFaves = friend.mutualFaves[category].length;
				var profileUrl = "https://www.facebook.com/" + friend.id;
				var _page = nFaves > 1 ? " pages" : " page";
				var sampleCategoryFaves = _.chain(friend.mutualFaves[category]).shuffle().first(10).value();
				var thumbnails = ""; // Page thumbnails, generate up to 8 maximum
				for (var j=0; j < _.min([sampleCategoryFaves.length, 8]); j++) {
					thumbnails +='<a target="_blank" href="http://www.facebook.com/' + sampleCategoryFaves[j]
						+'"><img src="' + getGraphImgSrc(sampleCategoryFaves[j])+ '?type=square" /></a>';
				}
				// Shows "..." if more than 8 items present.
				if(sampleCategoryFaves.length > 8) { thumbnails += "<img src='images/ellipsis20.png'/>"; }
				// 1. column - profile picture, linked
				row += '<td class="centered-content"><a href="' + profileUrl +'"><img src="' + getGraphImgSrc(friend.id)+ '?width=65&height=65" class="img-polaroid"/></a></td>';
				// 2. column - name, number of pages in common, some thumnails
				row += '<td><a href="' + profileUrl + '"><h5>' + friend.name +'</h5></a>'
					+ '<p>You both love ' + nFaves + _page + " from the " + category + " category.</p>"
					+ '<p style=" ">' + thumbnails + '</p></td>';
				// End of row.
				row += "</row>"
				table.append(row);
			} else {
				i = compatibleFriends[category].length; // Found the first friend with no mutually liked pages.
			}
		}
		FB.Canvas.setAutoGrow(); // Makes sure the Canvas is resized.
	} else {
		var noMutualMessage = "Hmm, it looks like your friends don't really share your taste in " + category + "...";
		$('<div class="alert">').html(noMutualMessage).insertBefore(placeholder);
	}
}


// Facebook & Application Initialization Code.
//==============================

// Code called on DOM 
$(document).ready(function() {
	if(window.FB) {
		init();
	} else {
		window.fbAsyncInit = init;
	}
});

function init() {
	FB.init({
		appId : '628931087252343',
		status 	: true,
		cookie : true,
		oauth : true,
		xfbml 	: true,
		version	: 'v2.2'
	});
	
	$(document).trigger("facebook:ready");
}

// Code called on "facebook:ready" event
$(document).on("facebook:ready", function() {
	FB.Canvas.setSize();
	authorize();
});

/**
 * Checks whether user login status and prompts for permissions.
 * Upon success, calls function to initialize the application. 
 */
function authorize() {
	FB.getLoginStatus(function(response) {
		if (response.status == 'connected') {
			// User is already connected with the App.
			handleUserConnect(response);
		} else {
			// Either not connected to app or not logged in to Facebook.
			login();
		}
	}, true); // Second parameter forces a roundtrip to Facebook - effectively refreshing the cache of the response object.
}

// Wrapper around FB.login
function login() {
    FB.login(function(response) {
        if (response.authResponse) {
            // Connected
            handleUserConnect(response);
        } else {
            // Cancelled
            handleUserCancel();
        }
    }, { scope: myData.scope }); 
}

function handleUserConnect(response) {
	myData.authResponse = response.authResponse;
	initializeApp();
}

function handleUserCancel() {
	$('<img id="profile-image" src="images/unknown-user.gif" style="display: none"/>').appendTo("#left-div");
	$('#profile-image').toggle('slow');
	$('#loading-img').toggle('slow');
	$("<div class='alert'>Oh well, I guess you don't want to find out which friends are most <i>like</i> you...</div>").appendTo('#unauth-error-msgs');
}


// Utility Functions
//==================

// Returns a Picture of an entity from Facebook Graph via its id.
function getGraphImgSrc(id) {
	return "https://graph.facebook.com/" + id +"/picture";
}

// Inserts error alert upon empty field.
function errorChecking(field, errorMessage, containerStr) {
	if(!field || field.length == 0 ) {
		// Insert error message div and return True.
		$('<div class="alert alert-error">').html(errorMessage).appendTo(containerStr);
		return true;
	} else { return false; }
}

// A function to update the CSS progress bar on page.
function updateProgressBar(numerator, denominator, progressBarSelectorStr) {
	var numerator = parseInt(numerator);
	var denominator = parseInt(denominator);
	var percentage = "0%";
	if (denominator != 0) {
		percentage = (100 * numerator / denominator).toString() + "%";
	}
	$(/*'#friend-progress'*/progressBarSelectorStr).css('width', percentage);
}

function boot_hide(select_str) {
	return $(select_str).addClass('invisible').hide('slow');
}

function boot_show(select_str) {
	return $(select_str).removeClass('invisible').show('slow');
}
