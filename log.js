/* 
Copyright 2013, BroadSoft, Inc.

Licensed under the Apache License,Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
 
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "ASIS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 */
var LOGGER = LOGGER || {};
 LOGGER.API = (function(){
 
	function log(component, message, data) {
			date = new Date();
			if (data) {
				console.log(getDate() + " " + component + " : " + message, data);
			} else {
				console.log(getDate() + " " + component + " : " + message);
			}
	 }

	function error(component, message, data) {
			date = new Date();
			if (data) {
				console.error(getDate() + " " + component + " : " + message, data);
			} else {
				console.error(getDate() + " " + component + " : " + message);
			}
	}

	function getDate() {
		var now     = new Date(); 
		var year    = now.getFullYear();
		var month   = now.getMonth()+1; 
		var day     = now.getDate();
		var hour    = now.getHours();
		var minute  = now.getMinutes();
		var second  = now.getSeconds(); 
		if(month.toString().length == 1) {
			month = '0'+month;
		}
		if(day.toString().length == 1) {
			day = '0'+day;
		}   
		if(hour.toString().length == 1) {
			hour = '0'+hour;
		}
		if(minute.toString().length == 1) {
			minute = '0'+minute;
		}
		if(second.toString().length == 1) {
			second = '0'+second;
		}   
		var dateTime = year+'/'+month+'/'+day+' '+hour+':'+minute+':'+second;   
		return dateTime;
	}
	
	return{
		log: log,
		error: error
	};

})();