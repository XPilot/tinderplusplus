(function() {
  var app = angular.module('tinder++', ['ngAutocomplete']);
  var gui = require('nw.gui');
  var tinder = require('tinderjs');
  var client = new tinder.TinderClient();
  if (localStorage.tinderToken) { client.setAuthToken(localStorage.tinderToken); }

  app.factory('API', function API() {
    return {
      login: function(id, token) {
        client.authorize(token, id, function(err, res, data) {
          console.log(res);
          localStorage.tinderToken = client.getAuthToken();
          localStorage.name = res.user.full_name;
          localStorage.smallPhoto = res.user.photos[0].processedFiles[3].url;
          window.location.reload();
        });
      },
      updateLocation: function(lat, lng, callback) {
        client.updatePosition(lat, lng, function(err, res, data) {
          console.log(res);
          callback();
        });
      },
      people: function(callbackFn, limit) {
        limit = limit || 10;
        client.getRecommendations(limit, function(err, res, data) {
          if (res.message && (res.message === 'recs timeout' || res.message === 'recs exhausted')) {
            swal({
              title: 'Sorry',
              text: 'Out of people for now - check back later!',
              type: 'error',
              confirmButtonColor: "#DD6B55",
              confirmButtonText: 'Got it'
            });
          } else {
            callbackFn(res.results);
          }
        });
      },
      userInfo: function(userId) {
        client.getUser(userId, function(err, res, data) {
          console.log(res);
        });
      },
      like: function(userId) {
        client.like(userId, function(err, res, data) {
          console.log(res);
          if (res.match) {
            swal({
              title: 'It\'s a match!',
              text: 'Go send a message (on your phone for now)',
              type: 'success',
              confirmButtonText: 'Nice'
            });
          }
        });
      },
      pass: function(userId) {
        client.pass(userId, function(err, res, data) {
          console.log(res);
        });
      },
      message: function(userId, message) {
        client.sendMessage(userId, message, function(err, res, data) {
          console.log(res);
        });
      }
    };
  });

  app.controller('TinderController', function TinderController($scope, $http, $timeout, $window, API) {
    $scope.allPeople = [];
    $scope.peopleIndex = 0;
    $scope.showLocation = false;

    $scope.autocompleteOptions = {
      types: '(cities)'
    };

    $scope.logout = function() {
      localStorage.clear();
      // clear the cache
      gui.App.clearCache();
      var nwWin = gui.Window.get();

      function removeCookie(cookie) {
        var lurl = "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;
        nwWin.cookies.remove({ url: lurl, name: cookie.name },
        function(result) {
          if (result) {
            if (!result.name) { result = result[0]; }
            console.log('cookie remove callback: ' + result.name + ' ' + result.url);
          } else {
            console.log('cookie removal failed');
          }
        });
      }

      nwWin.cookies.getAll({}, function(cookies) {
        console.log('Attempting to remove '+cookies.length+' cookies...');
        for (var i=0; i<cookies.length; i++) {
          removeCookie(cookies[i]);
        }
      });
      gui.Window.get().reloadIgnoringCache();
      //window.location.reload();
    };

    $scope.swapPhoto = function(index) {
      $scope.allPeople[$scope.peopleIndex].photoIndex = index;
    };

    $scope.getCookie = function(cookieName) {
      return localStorage[cookieName];
    };

    $scope.watchAutocomplete = function () { return $scope.details; };
    $scope.$watch($scope.watchAutocomplete, function (details) {
      if (details) {
        localStorage.currentCity = details.name;
        API.updateLocation(details.geometry.location.k, details.geometry.location.B, function() {
          getPeople();
        });
        $scope.showLocation = false;
        $('#autocompleteLocation').val('');
      }
    }, true);

    $scope.$on('cardsRendered', function() {
      initCards();
    });

    var getPeople = function() {
      API.people(setPeople);
    };

    var setPeople = function(people) {
      if (people && people.length) {
        $scope.peopleIndex = 0;
        $scope.allPeople = people;
        $.map($scope.allPeople, function(person) { person.photoIndex = 0; });
        $scope.$apply();
      }
    };

    var initCards = function() {
      $scope.cards = [].slice.call($('.tinder-card'));
      var $faderEls;

      var config = {
        throwOutConfidence: function (offset, element) {
          return Math.min(Math.abs(offset) / (element.offsetWidth / 3), 1);
        }
      };
      window.stack = gajus.Swing.Stack(config);

      $scope.cards.forEach(function (targetElement) {
        stack.createCard(targetElement);
      });

      stack.on('throwout', function (e) {
        var userId = $scope.allPeople[$scope.peopleIndex]._id;
        // TODO: add to queue instead of liking/passing immediately
        (e.throwDirection < 0) ? API.pass(userId) : API.like(userId);
        $scope.peopleIndex++;
        $scope.$apply();
        $(e.target).fadeOut(500);
        if ($scope.peopleIndex >= $scope.allPeople.length) {
          getPeople();
        }
      });

      stack.on('throwin', function (e) {
        $('.pass-overlay, .like-overlay').css('opacity', 0);
      });

      var fadeDebounce = debounce(function(opacity) {
        if ($faderEls)
          $faderEls.css('opacity', opacity);
      }, 10);

      stack.on('dragmove', function (obj) {
        obj.origEvent.srcEvent.preventDefault();
        if (!$passOverlay || !$likeOverlay) {
          $passOverlay = $(obj.target).children('.pass-overlay');
          $likeOverlay = $(obj.target).children('.like-overlay');
        }
        if (!$faderEls) {
          $faderEls = $('.fader');
        }

        var opacity = (1 - obj.throwOutConfidence).toFixed(2);
        if ($faderEls && (parseFloat($faderEls.first().css('opacity')).toFixed(2) != opacity)) {
          fadeDebounce(opacity);
        }

        if (obj.throwDirection < 0) { // left
          pass(obj.throwOutConfidence);
        } else { // right
          like(obj.throwOutConfidence);
        }
      });

      stack.on('dragend', function(e) {
        $passOverlay = $likeOverlay = null;
        if ($faderEls) {
          $faderEls.fadeTo(600, 1);
          $faderEls = null;
        }
      });

      Mousetrap.bind('left', function () {
        var cardEl = $scope.cards[$scope.cards.length - $scope.peopleIndex - 1];
        var card = stack.getCard(cardEl);
        card.throwOut(-100, -50);
        $passOverlay = $(cardEl).children('.pass-overlay');
        $likeOverlay = $(cardEl).children('.like-overlay');
        pass(1);
      });

      Mousetrap.bind('right', function () {
        var cardEl = $scope.cards[$scope.cards.length - $scope.peopleIndex - 1];
        var card = stack.getCard(cardEl);
        card.throwOut(100, -50);
        $passOverlay = $(cardEl).children('.pass-overlay');
        $likeOverlay = $(cardEl).children('.like-overlay');
        like(1);
      });

      // randomize rotation
      $timeout(function() {
        $.each($scope.cards, function(idx, card) {
          var $card = $(card);
          var marginLeft = parseInt($card.css('margin-left'));
          $card.css('margin-left', '-' + (Math.floor(Math.random()*((marginLeft+10)-(marginLeft-10)+1)+(marginLeft-10))) + 'px')
              .css('transform', 'rotate(' + (Math.floor(Math.random()*(3+3+1)-3)) + 'deg)');
        });
      }, 0, false);
    };

    getPeople();

  });

  app.controller('LoginController', function LoginController($scope, $http, API) {
    $scope.loginUrl = 'https://m.facebook.com/dialog/oauth?client_id=464891386855067&redirect_uri=https://www.facebook.com/connect/login_success.html&scope=basic_info,email,public_profile,user_about_me,user_activities,user_birthday,user_education_history,user_friends,user_interests,user_likes,user_location,user_photos,user_relationship_details&response_type=token';
    $scope.fbAuthData = {};

    $scope.hasValidToken = function() {
      return !!localStorage.tinderToken;
    };

    $scope.startLogin = function() {
      var loginWindow = gui.Window.open($scope.loginUrl, {
        position: 'center',
        width: 400,
        height: 480
      });
      var interval = window.setInterval(function() {
        checkForToken(loginWindow.window, interval);
      }, 500);
      loginWindow.on('closed', function() {
        window.clearInterval(interval);
        loginWindow = null;
      });
    };

    var tinderLogin = function() {
      API.login($scope.fbAuthData['fb_id'], $scope.fbAuthData['access_token']);
    };

    var checkForToken = function(loginWindow, interval) {
      if (loginWindow.closed){
        window.clearInterval(interval);
      } else {
        var url = loginWindow.document.URL;
        var paramString = url.split("#")[1];
        if (!!paramString) {
          var allParam = paramString.split("&");
          for (var i = 0; i < allParam.length; i++) {
            var param = allParam[i].split("=");
            $scope.fbAuthData[param[0]] = param[1];
          }
          loginWindow.close();
          window.clearInterval(interval);
          getFBUserId($scope.fbAuthData['access_token']);
        }
      }
    };

    var getFBUserId = function(token) {
      var graphUrl = 'https://graph.facebook.com/me?access_token=' + token;
      $http.get(graphUrl)
          .success(function(data) {
            console.log(data);
            $scope.fbAuthData['fb_id'] = data.id;
            tinderLogin();
          })
          .error(function(data) {
            console.log(data);
          });
    }
  });

  app.directive('renderImagesDirective', function() {
    return function(scope, element, attrs) {
      if (scope.$last){
        scope.$emit('cardsRendered');
      }
    };
  });

  app.filter('bdayToAge', function () {
    return function (bday) {
      return moment.duration(moment().diff(moment(bday))).years();
    };
  });

  var $passOverlay, $likeOverlay;

  function pass(confidence) {
    applyOpacity($passOverlay, $likeOverlay, confidence);
  }

  function like(confidence) {
    applyOpacity($likeOverlay, $passOverlay, confidence);
  }

  function applyOpacity(applyEl, clearEl, confidence) {
    applyEl.css('opacity', confidence * (2 / 3));
    clearEl.css('opacity', 0);
  }

  // helpers

  var debounce = function(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  };
})();
