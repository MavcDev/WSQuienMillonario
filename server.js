
var wsPort = 1220;
var rooms = [];

var webSocketServer = require('websocket').server;
var http = require('http');

var server = http.createServer(function(request, response) {});

server.listen(wsPort, function() {
    console.log((new Date()) + " Server is listening on port " + wsPort);
});

var wsServer = new webSocketServer({
    httpServer: server
});

wsServer.on('request', function(request) {
    var connection = request.accept(null, request.origin); 

    connection.on('message', function(message) {
        if (message.type != 'utf8') return;

        console.log(message);
        var msgJson = JSON.parse(message.utf8Data);
        var id = msgJson.id;
        var myRoom = null;

        console.log(msgJson.op);
        if(msgJson.op != 0){
            myRoom = findRoom(id);
            
            if(!myRoom){
                notFoundRoom(connection);
                return;
            }
        }

        switch(msgJson.op){
            case 0:
                openRoom(connection, id);
                break;
            case 1:
                openGuest(myRoom, connection);
                sendRoomQuestion(myRoom, connection);
                if(myRoom.answer.isOpen){
                    sendConnRoom(myRoom, connection, {op: 2, data: {is: true}});
                }
                break;
            case 2:
                updateQuestion(myRoom, connection, msgJson.data.q);
                broadCastRoomQuestion(myRoom);
                break;
            case 3:
                broadCastRoomInitVoted(myRoom);
                break;
            case 4:
                votedGuest(myRoom, connection, msgJson.data);
                break;
            case 5:
                broadCastRomCancelVoted(myRoom);
                sendVotedParent(myRoom, connection);
                break;
            case 6:
                closeRoom(myRoom);
                break;
        }

        if(msgJson.op < 0 && msgJson.op > 6){
            notFoundOption(connection);
        }

    });

    connection.on('close', function(connection) {
        console.log((new Date()) + " Peer " + connection.remoteAddress + " disconnected.");
        var roomSelect = rooms.find(roomAux => {
            roomAux.indexParent = connection;
        });
        if(roomSelect){ closeRoom(roomSelect); }
    });
});

function notFoundRoom(conn){
    sendConnRoom(null, conn, {op: 5, data: {msg: 'No se econtro la sala.'}});
    conn.close();
}

function notFoundOption(conn){
    sendConnRoom(null, conn, {op: 5, data: {msg: 'No se encontro operacion valida.'}});
    conn.close();
}

function openRoom(conn, id){
    rooms.push(
        {
            id: id,
            indexParent: conn,
            indexChild: [],
            question: {},
            answer: {isOpen: false, a: 0, b: 0, c: 0, d: 0}
        }
    );
    sendConnRoom(null, conn, {op: 6, data: {msg: 'Se ha creado la sala.'}});

    console.log('Se ha creado la sala');
}

function findRoom(id){
    return  rooms.find(r => r.id == id );
}

function openGuest(myRoom, conn){
    myRoom.indexChild.push(conn);
    console.log('Se ha agredado un visitante');
}

function updateQuestion(myRoom, conn, question){
    if(!question) return;
    if(conn != myRoom.indexParent) return;
    myRoom.question = question;
    console.log('Se ha actualizado la pregunta');
}

// voted: {l: a}
function votedGuest(myRoom, conn, voted){
    if(myRoom.answer.isOpen){
        countVoted(myRoom, voted);
        sendConnRoom(myRoom, conn, {op: 3, data: {isVoted: true}});
    }else{
        sendConnRoom(myRoom, conn, {op: 3, data: {isVoted: false}});
    }
    console.log('Un visitamte realizo la votacion');
}

function countVoted(myRoom, voted){   
     switch(voted.l){
        case 'a':
            myRoom.answer.a += 1;
        break;
        case 'b':
            myRoom.answer.b += 1;
        break;
        case 'c':
            myRoom.answer.c += 1;
        break;
        case 'd':
            myRoom.answer.d += 1;
        break;
     }
}

function sendRoomQuestion(myRoom, conn){
    sendConnRoom(myRoom, conn, {op: 1, data: {q: myRoom.question}})
}

function sendVotedParent(myRoom, conn){
    if(myRoom.indexParent != conn) return;
    sendConnRoom(myRoom, conn, {op: 4, data: {
        res: [
            myRoom.answer.a,
            myRoom.answer.b,
            myRoom.answer.c,
            myRoom.answer.d
        ]
    }})
}

function broadCastRoomQuestion(myRoom){
    sendBroadCastRoom(myRoom, {op: 1, data: {q: myRoom.question}});
}

function broadCastRoomInitVoted(myRoom){
    myRoom.answer.isOpen = true;
    sendBroadCastRoom(myRoom, {op: 2, data: {is: true}});
}

function broadCastRomCancelVoted(myRoom){
    myRoom.answer.isOpen = false;
    sendBroadCastRoom(myRoom, {op: 2, data: {is: false}});
}

function sendBroadCastRoom(myRoom, data){
    myRoom.indexChild.forEach(conn => {
        if(conn.connected){
            conn.sendUTF( JSON.stringify(data) );
        }else{
            var indexDel = myRoom.indexChild.findIndex(connAux => connAux == conn );
            myRoom.indexChild.splice(indexDel, 1);
        }
    });
}

function sendConnRoom(myRoom, conn, data){
    if(conn.connected){
        conn.sendUTF( JSON.stringify(data) );
    }else{
        if(myRoom){
            var indexDel = myRoom.indexChild.findIndex(connAux => connAux == conn );
            myRoom.indexChild.splice(indexDel, 1);
        }
    }
}

function closeRoom(myRoom){
    myRoom.indexChild.forEach(conn => {
        if(conn.connected){
            sendConnRoom(myRoom, conn, {op: 7});
            conn.close();
        }
    });

    if(myRoom.indexParent.connected){
        myRoom.indexParent.close();
    }

    var index = rooms.findIndex(roomAux => roomAux == myRoom);
    rooms.splice(index, 1);
    console.log('Se ha finalizo la sala.');
}
